/**
 * Live check for the Raspberry Pi ingest route.
 *
 * Posts one sample for Alumni House tree 1, reads that row back through the
 * metrics API, then posts the same sample again and expects the retry to come
 * back as a duplicate. Each run uses its own timestamp, so running it twice
 * stores two readings.
 *
 * The API has to be up, and GATEWAY_INGEST_TOKEN in this environment has to be
 * the same value the API process loaded.
 *
 *   npm run check-ingest
 *   npm run check-ingest -- http://localhost:3000
 */

import jwt from 'jsonwebtoken';

const BASE = (process.argv[2] ?? 'http://localhost:8080/api').replace(/\/+$/, '');
const TOKEN = (process.env.GATEWAY_INGEST_TOKEN ?? '').trim();
const SECRET = process.env.JWT_SECRET;

let passed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(`${label}${detail ? ` -- ${detail}` : ''}`);
    console.log(`  FAIL ${label}${detail ? ` -- ${detail}` : ''}`);
  }
}

async function request(path, { method = 'GET', token, session, body } = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(token ? { 'x-gateway-token': token } : {}),
        ...(session ? { authorization: `Bearer ${session}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    console.error(`Cannot reach ${BASE} (${error.message}).`);
    console.error('Start the stack with docker compose up, then run this again.');
    process.exit(1);
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, payload };
}

if (!TOKEN) {
  console.error('GATEWAY_INGEST_TOKEN is empty. Set it in Maple-Sugar-BE/.env and restart the API.');
  process.exit(1);
}
if (!SECRET) {
  console.error('JWT_SECRET is empty. The read-back check signs a short-lived admin session with it.');
  process.exit(1);
}

const admin = jwt.sign({ sub: '1', email: 'tpalmer@rit.edu', roleId: 1 }, SECRET, {
  expiresIn: 300,
  issuer: 'maple-sugar-api',
});

// A few seconds ago, so a clock skew does not make the reading look future-dated.
const recordedAt = new Date(Date.now() - 5_000).toISOString();
const sample = {
  Gateway_Code: 'GW-ALUMNI',
  Node_Code: 'NODE-001',
  Recorded_At: recordedAt,
  Weight: 11.25,
  Temperature: 35.5,
};

console.log(`Ingest check against ${BASE}`);

const health = await request('/health');
check('GET /health is up', health.status === 200 && health.payload?.database === true, `got ${health.status}`);

const missing = await request('/ingest', { method: 'POST', body: sample });
check('missing token is 401', missing.status === 401 && missing.payload?.code === 'BAD_CREDENTIALS', JSON.stringify(missing.payload));

const wrong = await request('/ingest', { method: 'POST', token: `${TOKEN}-nope`, body: sample });
check('wrong token is 401', wrong.status === 401 && wrong.payload?.code === 'BAD_CREDENTIALS', JSON.stringify(wrong.payload));

if (missing.status === 503 || wrong.status === 503) {
  console.error('\nThe API is up but ingest is closed. Restart it so it loads GATEWAY_INGEST_TOKEN.');
  process.exit(1);
}

const unknown = await request('/ingest', {
  method: 'POST',
  token: TOKEN,
  body: { ...sample, Gateway_Code: 'GW-DOES-NOT-EXIST' },
});
check('unknown gateway is 404', unknown.status === 404 && unknown.payload?.code === 'NOT_FOUND', JSON.stringify(unknown.payload));

const created = await request('/ingest', { method: 'POST', token: TOKEN, body: sample });
const reading = created.payload?.Accepted?.[0]?.Reading;
check(
  'sample push is 201, with no user and no node temperature',
  created.status === 201 &&
    created.payload?.Accepted?.length === 1 &&
    reading?.Recorded_By_UserID == null &&
    reading?.Weight === 11.25 &&
    reading?.Temperature == null &&
    reading?.NodeID === 1,
  `got ${created.status} ${JSON.stringify(created.payload)}`,
);

const retry = await request('/ingest', { method: 'POST', token: TOKEN, body: sample });
check(
  'the same sample is a duplicate, not a second row',
  retry.status === 200 &&
    retry.payload?.Accepted?.[0]?.Duplicate === true &&
    retry.payload?.Accepted?.[0]?.Reading?.MetricID === reading?.MetricID,
  `got ${retry.status} ${JSON.stringify(retry.payload)}`,
);

const query = new URLSearchParams({ nodeId: '1', from: recordedAt, to: recordedAt });
const listed = await request(`/metrics?${query}`, { session: admin });
const stored = Array.isArray(listed.payload)
  ? listed.payload.find((row) => row.MetricID === reading?.MetricID)
  : null;
check(
  'the reading is visible on GET /metrics',
  listed.status === 200 &&
    stored?.Weight === 11.25 &&
    stored?.Temperature == null &&
    stored?.Recorded_By_UserID == null,
  `got ${listed.status} ${JSON.stringify(listed.payload)}`,
);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (reading?.MetricID) {
  console.log(`Stored MetricID ${reading.MetricID} at ${recordedAt} (11.25 lb on NODE-001).`);
}
if (failures.length) {
  console.log('\nFailures:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log('Ingest is accepting sensor pushes.');
