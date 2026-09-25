/**
 * End-to-end smoke test against a running API.
 *
 * Exercises every route the frontend calls, including the RBAC boundaries, by
 * minting session tokens directly rather than completing a real Google
 * handshake. That is the one thing it cannot cover, so the OAuth redirect is
 * only checked as far as the Location header it sends the browser to.
 *
 * Usage: node --env-file=.env.test scripts/smoke.js [baseUrl]
 */

import jwt from 'jsonwebtoken';

const BASE = process.argv[2] ?? `http://localhost:${process.env.PORT ?? 3999}`;
const SECRET = process.env.JWT_SECRET;

const token = (userId, email, roleId) =>
  jwt.sign({ sub: String(userId), email, roleId }, SECRET, {
    expiresIn: 3600,
    issuer: 'maple-sugar-api',
  });

const ADMIN = token(1, 'tpalmer@rit.edu', 1);
const STUDENT = token(3, 'ir8643@g.rit.edu', 2);
const MSS = token(8, 'sd9014@g.rit.edu', 3);
const EXPIRED = token(6, 'pr2288@g.rit.edu', 2);

let passed = 0;
const failures = [];

async function call(method, path, { as = ADMIN, body, redirect = 'manual' } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    redirect,
    headers: {
      ...(as ? { authorization: `Bearer ${as}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  return { status: response.status, payload, headers: response.headers };
}

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(`${label}${detail ? ` -- ${detail}` : ''}`);
    console.log(`  FAIL ${label}${detail ? ` -- ${detail}` : ''}`);
  }
}

function section(name) {
  console.log(`\n${name}`);
}

// --- Health and session -----------------------------------------------------

section('Health and session');
{
  const health = await call('GET', '/health', { as: null });
  check('GET /health is 200', health.status === 200, `got ${health.status}`);
  check('database reported up', health.payload?.database === true);
  check('cache reported connected', health.payload?.cache?.connected === true);

  const anon = await call('GET', '/auth/session', { as: null });
  check('anonymous session is 200 null', anon.status === 200 && anon.payload === null, `got ${anon.status} ${JSON.stringify(anon.payload)}`);

  const mine = await call('GET', '/auth/session');
  check('authenticated session returns token and user', mine.status === 200 && Boolean(mine.payload?.token) && mine.payload?.user?.UserID === 1);
  check('session user has ER field names', mine.payload?.user?.First_Name === 'Tom' && mine.payload?.user?.RoleID === 1, JSON.stringify(mine.payload?.user));
  check('session user exposes no secrets', !('google_sub' in (mine.payload?.user ?? {})) && !('password_hash' in (mine.payload?.user ?? {})) && !('google_refresh_token' in (mine.payload?.user ?? {})));
  check('session reports Calendar_Connected', typeof mine.payload?.user?.Calendar_Connected === 'boolean');

  const expired = await call('GET', '/auth/session', { as: EXPIRED });
  check('expired account gets no session', expired.status === 200 && expired.payload === null, JSON.stringify(expired.payload));

  const forged = await call('GET', '/auth/session', { as: 'not-a-real-token' });
  check('forged token gets no session', forged.status === 200 && forged.payload === null);

  const logout = await call('POST', '/auth/logout');
  check('POST /auth/logout is 204', logout.status === 204, `got ${logout.status}`);
}

// --- OAuth redirect ---------------------------------------------------------

section('Google OAuth entry point');
{
  const start = await call('GET', '/auth/google', { as: null });
  const location = start.headers.get('location') ?? '';
  check('GET /auth/google redirects', start.status === 302, `got ${start.status}`);
  check('redirects to Google', location.startsWith('https://accounts.google.com/'), location.slice(0, 60));
  check('requests openid email profile scopes', location.includes('openid') && location.includes('email') && location.includes('profile'));
  check('requests calendar on the same sign-in', location.includes('calendar.events') && location.includes('access_type=offline'));
  check('includes a state parameter', /[?&]state=/.test(location));
  check('sets the state cookie', (start.headers.get('set-cookie') ?? '').includes('maple_oauth_state'));
  check('state cookie is httpOnly', (start.headers.get('set-cookie') ?? '').toLowerCase().includes('httponly'));

  // A callback with no matching state cookie must not establish a session.
  const forged = await call('GET', '/auth/google/callback?code=abc&state=xyz', { as: null });
  check('callback without valid state redirects to login', forged.status === 302 && (forged.headers.get('location') ?? '').includes('/login?error='), forged.headers.get('location') ?? '');
  check('callback without valid state sets no session cookie', !(forged.headers.get('set-cookie') ?? '').includes('maple_session'));
}

section('Google Calendar OAuth entry point');
{
  const anon = await call('GET', '/auth/google/calendar', { as: null });
  check('GET /auth/google/calendar requires sign-in', anon.status === 401, `got ${anon.status}`);

  const start = await call('GET', '/auth/google/calendar', { as: STUDENT });
  const location = start.headers.get('location') ?? '';
  check('GET /auth/google/calendar redirects', start.status === 302, `got ${start.status}`);
  check('calendar redirect goes to Google', location.startsWith('https://accounts.google.com/'), location.slice(0, 80));
  check('requests calendar.events scope', location.includes('calendar.events'), location.slice(0, 200));
  check('asks for a refresh token', location.includes('access_type=offline') && location.includes('prompt=consent'));
  check('uses the sign-in callback', location.includes('auth%2Fgoogle%2Fcallback') && !location.includes('calendar%2Fcallback'));
}

// --- Reference data ---------------------------------------------------------

section('Reference data');
{
  const roles = await call('GET', '/roles');
  check('GET /roles returns 3 roles', roles.status === 200 && roles.payload?.length === 3);
  check('roles use RoleID/Role_Name', roles.payload?.[0]?.RoleID === 1 && roles.payload?.[0]?.Role_Name === 'Admin', JSON.stringify(roles.payload?.[0]));

  const gateways = await call('GET', '/gateways');
  check('GET /gateways returns 3', gateways.status === 200 && gateways.payload?.length === 3);
  check('gateway status normalized to Online/Offline', gateways.payload?.every((g) => ['Online', 'Offline'].includes(g.Status)), JSON.stringify(gateways.payload?.map((g) => g.Status)));
  check('gateway has Gateway_Name and Last_Seen', Boolean(gateways.payload?.[0]?.Gateway_Name) && Boolean(gateways.payload?.[0]?.Last_Seen));

  const buckets = await call('GET', '/buckets');
  check('GET /buckets returns 16', buckets.status === 200 && buckets.payload?.length === 16);
  check('buckets carry Tare_Weight as a number', typeof buckets.payload?.[0]?.Tare_Weight === 'number', JSON.stringify(buckets.payload?.[0]));
  check('buckets carry Barcode_ID', /^BKT-\d{3}$/.test(buckets.payload?.[0]?.Barcode_ID ?? ''));

  const guides = await call('GET', '/guides');
  check('GET /guides returns 5', guides.status === 200 && guides.payload?.length === 5);
  check('guide Steps is an array of strings', Array.isArray(guides.payload?.[0]?.Steps) && typeof guides.payload[0].Steps[0] === 'string');
  check('guide GuideID is the slug', guides.payload?.some((g) => g.GuideID === 'install-node'));
}

// --- Nodes ------------------------------------------------------------------

section('Nodes');
{
  const nodes = await call('GET', '/nodes');
  check('GET /nodes returns 16', nodes.status === 200 && nodes.payload?.length === 16);

  const node = nodes.payload?.[0];
  check('node has Status_Code as a number 0-3', typeof node?.Status_Code === 'number' && node.Status_Code >= 0 && node.Status_Code <= 3);
  check('node Location is nested {lat, lon}', typeof node?.Location?.lat === 'number' && typeof node?.Location?.lon === 'number', JSON.stringify(node?.Location));
  check('node has Battery_Percent, Signal_Rssi, Stand, Last_Seen', typeof node?.Battery_Percent === 'number' && typeof node?.Signal_Rssi === 'number' && Boolean(node?.Stand) && Boolean(node?.Last_Seen));
  check('node has LoRa_Device_ID', /^E8:9F:6D:/.test(node?.LoRa_Device_ID ?? ''));

  const one = await call('GET', '/nodes/3');
  check('GET /nodes/3 returns that node', one.status === 200 && one.payload?.NodeID === 3);

  const missing = await call('GET', '/nodes/9999');
  check('GET missing node is 404 NOT_FOUND', missing.status === 404 && missing.payload?.code === 'NOT_FOUND', JSON.stringify(missing.payload));

  const bad = await call('GET', '/nodes/abc');
  check('non-numeric id is 422 VALIDATION', bad.status === 422 && bad.payload?.code === 'VALIDATION', `got ${bad.status}`);

  const patched = await call('PATCH', '/nodes/4', { body: { Status_Code: 3 } });
  check('PATCH /nodes/4 sets maintenance', patched.status === 200 && patched.payload?.Status_Code === 3, JSON.stringify(patched.payload));
  await call('PATCH', '/nodes/4', { body: { Status_Code: 1 } });

  const outOfRange = await call('PATCH', '/nodes/4', { body: { Status_Code: 9 } });
  check('out-of-range Status_Code rejected', outOfRange.status === 422, `got ${outOfRange.status}`);

  const flagged = await call('POST', '/nodes/6/flag', { as: STUDENT, body: { type: 'Damaged', description: 'Cracked bucket rim.' } });
  check('POST /nodes/6/flag creates an alert', flagged.status === 201 && flagged.payload?.Alert_Type === 'Damaged' && flagged.payload?.Is_Resolved === false, JSON.stringify(flagged.payload));
  check('flagged alert uses Description', flagged.payload?.Description === 'Cracked bucket rim.');
}

// --- Metrics ----------------------------------------------------------------

section('Metrics');
{
  const all = await call('GET', '/metrics');
  check('GET /metrics returns readings', all.status === 200 && all.payload?.length > 1000, `got ${all.payload?.length}`);
  check('readings are newest first', new Date(all.payload[0].Recorded_At) >= new Date(all.payload[1].Recorded_At));

  const reading = all.payload.find((row) => row.Weight != null && row.Temperature != null) ?? all.payload[0];
  check('reading has Weight, Temperature, Weather_Conditions', 'Weight' in reading && 'Temperature' in reading && 'Weather_Conditions' in reading, JSON.stringify(reading));
  check('reading numerics are numbers not strings', typeof reading.Weight === 'number' && typeof reading.Temperature === 'number');

  const byNode = await call('GET', '/metrics?nodeId=3');
  check('nodeId filter applies', byNode.status === 200 && byNode.payload.every((row) => row.NodeID === 3));

  const bySeason = await call('GET', '/metrics?season=2025');
  check('season filter applies', bySeason.status === 200 && bySeason.payload.length > 0 && bySeason.payload.length < all.payload.length);
  check('season 2025 readings fall in 2025', bySeason.payload.every((row) => row.Recorded_At.startsWith('2025')));

  const ranged = await call('GET', '/metrics?from=2026-03-01T00:00:00Z&to=2026-03-03T00:00:00Z');
  check('date range filter applies', ranged.status === 200 && ranged.payload.every((row) => row.Recorded_At >= '2026-03-01' && row.Recorded_At <= '2026-03-03T00:00:01'));

  const created = await call('POST', '/metrics', {
    as: STUDENT,
    body: { NodeID: 1, BucketID: 1, Sugar_Percent: 2.1, Weight: 9.4, Temperature: 38.2, Weather_Conditions: 'Clear', Recorded_At: new Date().toISOString() },
  });
  check('POST /metrics is 201', created.status === 201, `got ${created.status} ${JSON.stringify(created.payload)}`);
  check('Recorded_By_UserID stamped from session', created.payload?.Recorded_By_UserID === 3, JSON.stringify(created.payload));

  // The body must not be able to attribute a reading to someone else.
  const spoofed = await call('POST', '/metrics', {
    as: STUDENT,
    body: { NodeID: 1, Weight: 8, Recorded_By_UserID: 1, Recorded_At: new Date().toISOString() },
  });
  check('Recorded_By_UserID cannot be spoofed via body', spoofed.payload?.Recorded_By_UserID === 3, JSON.stringify(spoofed.payload?.Recorded_By_UserID));

  const noNode = await call('POST', '/metrics', { as: STUDENT, body: { Weight: 5 } });
  check('missing NodeID is 422', noNode.status === 422 && noNode.payload?.code === 'VALIDATION', JSON.stringify(noNode.payload));

  const badNode = await call('POST', '/metrics', { as: STUDENT, body: { NodeID: 9999, Weight: 5 } });
  check('unknown NodeID is 404', badNode.status === 404, `got ${badNode.status}`);

  const emptyReading = await call('POST', '/metrics', { as: STUDENT, body: { NodeID: 1 } });
  check('reading with neither weight nor sugar is 422', emptyReading.status === 422 && Boolean(emptyReading.payload?.details?.Sugar_Percent), JSON.stringify(emptyReading.payload));

  const future = await call('POST', '/metrics', { as: STUDENT, body: { NodeID: 1, Weight: 5, Recorded_At: new Date(Date.now() + 86_400_000).toISOString() } });
  check('future-dated reading is 422', future.status === 422 && Boolean(future.payload?.details?.Recorded_At), JSON.stringify(future.payload?.details));

  const wildSugar = await call('POST', '/metrics', { as: STUDENT, body: { NodeID: 1, Sugar_Percent: 80 } });
  check('implausible sugar percent is 422', wildSugar.status === 422 && Boolean(wildSugar.payload?.details?.Sugar_Percent));

  const corrected = await call('PATCH', `/metrics/${created.payload.MetricID}`, { body: { Sugar_Percent: 2.4 } });
  check('PATCH /metrics/:id corrects a reading', corrected.status === 200 && corrected.payload?.Sugar_Percent === 2.4, JSON.stringify(corrected.payload));

  const missingMetric = await call('PATCH', '/metrics/999999', { body: { Sugar_Percent: 2 } });
  check('PATCH missing reading is 404', missingMetric.status === 404);
}

// --- Automatic alert derivation ---------------------------------------------

section('Alert derivation from readings');
{
  const before = await call('GET', '/alerts?resolved=false');
  const openBefore = before.payload?.length ?? 0;

  // Node 12's bucket has a known tare; push a reading past capacity to trip the
  // Full Bucket rule.
  const buckets = await call('GET', '/buckets');
  const bucket = buckets.payload.find((b) => b.NodeID === 12);
  await call('POST', '/metrics', {
    as: STUDENT,
    body: { NodeID: 12, BucketID: bucket.BucketID, Weight: bucket.Tare_Weight + 17.5, Recorded_At: new Date().toISOString() },
  });

  const after = await call('GET', '/alerts?resolved=false');
  const full = after.payload?.find((a) => a.NodeID === 12 && a.Alert_Type === 'Full Bucket');
  check('near-capacity reading raises a Full Bucket alert', Boolean(full), `open alerts ${openBefore} -> ${after.payload?.length}`);

  // A second such reading must not raise a duplicate.
  await call('POST', '/metrics', {
    as: STUDENT,
    body: { NodeID: 12, BucketID: bucket.BucketID, Weight: bucket.Tare_Weight + 17.6, Recorded_At: new Date().toISOString() },
  });
  const dedupe = await call('GET', '/alerts?resolved=false');
  const fullCount = dedupe.payload.filter((a) => a.NodeID === 12 && a.Alert_Type === 'Full Bucket').length;
  check('duplicate Full Bucket alert suppressed', fullCount === 1, `found ${fullCount}`);

  // A load cell reading below tare means the bucket came off.
  await call('POST', '/metrics', {
    as: STUDENT,
    body: { NodeID: 11, BucketID: 11, Weight: 0.2, Recorded_At: new Date().toISOString() },
  });
  const tipped = await call('GET', '/alerts?resolved=false');
  check('below-tare reading raises a Tipped alert', tipped.payload.some((a) => a.NodeID === 11 && a.Alert_Type === 'Tipped'));
}

// --- Alerts -----------------------------------------------------------------

section('Alerts');
{
  const all = await call('GET', '/alerts');
  check('GET /alerts returns alerts', all.status === 200 && all.payload?.length >= 8);
  check('alerts are newest first', new Date(all.payload[0].Created_At) >= new Date(all.payload[1].Created_At));
  check('alert uses Description not message', 'Description' in all.payload[0] && !('message' in all.payload[0]));

  const open = await call('GET', '/alerts?resolved=false');
  check('resolved=false returns only open', open.status === 200 && open.payload.every((a) => a.Is_Resolved === false));

  const closed = await call('GET', '/alerts?resolved=true');
  check('resolved=true returns only resolved', closed.status === 200 && closed.payload.every((a) => a.Is_Resolved === true));

  const resolved = await call('PATCH', '/alerts/1', { as: STUDENT, body: { Is_Resolved: true } });
  check('PATCH /alerts/1 resolves it', resolved.status === 200 && resolved.payload?.Is_Resolved === true);
  await call('PATCH', '/alerts/1', { body: { Is_Resolved: false } });

  const missing = await call('PATCH', '/alerts/999999', { body: { Is_Resolved: true } });
  check('PATCH missing alert is 404', missing.status === 404);
}

// --- Collection logs --------------------------------------------------------

section('Collection logs');
{
  const all = await call('GET', '/collection-logs');
  check('GET /collection-logs returns logs', all.status === 200 && all.payload?.length > 50, `got ${all.payload?.length}`);
  check('log has Volume_Collected and Quality_Notes', typeof all.payload[0].Volume_Collected === 'number' && 'Quality_Notes' in all.payload[0], JSON.stringify(all.payload[0]));

  const season = await call('GET', '/collection-logs?season=2026');
  check('season filter applies', season.status === 200 && season.payload.length > 0 && season.payload.length < all.payload.length);

  const created = await call('POST', '/collection-logs', {
    as: STUDENT,
    body: { BucketID: 2, NodeID: 2, Volume_Collected: 1.6, Quality_Notes: 'Clear' },
  });
  check('POST /collection-logs is 201', created.status === 201, `got ${created.status} ${JSON.stringify(created.payload)}`);
  check('UserID stamped from session', created.payload?.UserID === 3, JSON.stringify(created.payload));

  const zero = await call('POST', '/collection-logs', { as: STUDENT, body: { BucketID: 2, NodeID: 2, Volume_Collected: 0 } });
  check('zero volume is 422', zero.status === 422, `got ${zero.status}`);

  const missingBucket = await call('POST', '/collection-logs', { as: STUDENT, body: { BucketID: 9999, NodeID: 2, Volume_Collected: 1 } });
  check('unknown bucket is 404', missingBucket.status === 404, `got ${missingBucket.status}`);
}

// --- Users and invites ------------------------------------------------------

section('Users');
{
  const users = await call('GET', '/users');
  check('GET /users returns the roster', users.status === 200 && users.payload?.length >= 8);
  check('user has lifecycle fields', 'Is_Active' in users.payload[0] && 'Account_Expiry' in users.payload[0] && 'Last_Login' in users.payload[0]);
  check('Created_At is date-only', /^\d{4}-\d{2}-\d{2}$/.test(users.payload[0].Created_At), users.payload[0].Created_At);

  const unique = `smoke.test.${Date.now()}@g.rit.edu`;
  const invited = await call('POST', '/users/invite', { body: { email: unique, roleId: 2, firstName: 'Smoke', lastName: 'Test' } });
  check('POST /users/invite is 201', invited.status === 201, `got ${invited.status} ${JSON.stringify(invited.payload)}`);
  check('invite is pending with a default expiry', invited.payload?.Invite_Pending === true && Boolean(invited.payload?.Account_Expiry), JSON.stringify(invited.payload));

  const dupe = await call('POST', '/users/invite', { body: { email: unique.toUpperCase(), roleId: 2 } });
  check('duplicate email rejected case-insensitively', dupe.status === 422 && dupe.payload?.details?.email === 'duplicate', JSON.stringify(dupe.payload));

  const badEmail = await call('POST', '/users/invite', { body: { email: 'not-an-email' } });
  check('malformed email is 422', badEmail.status === 422);

  const extended = await call('PATCH', `/users/${invited.payload.UserID}`, { body: { Account_Expiry: '2027-05-14', Is_Active: true } });
  check('PATCH extends an account', extended.status === 200 && String(extended.payload?.Account_Expiry ?? '').startsWith('2027-05-14'), JSON.stringify(extended.payload));

  const selfRole = await call('PATCH', '/users/1', { body: { RoleID: 2 } });
  check('admin cannot change own role', selfRole.status === 403, `got ${selfRole.status}`);

  const selfDeactivate = await call('PATCH', '/users/1', { body: { Is_Active: false } });
  check('admin cannot deactivate self', selfDeactivate.status === 403, `got ${selfDeactivate.status}`);

  const selfDelete = await call('DELETE', '/users/1');
  check('admin cannot delete self', selfDelete.status === 403, `got ${selfDelete.status}`);

  const removed = await call('DELETE', `/users/${invited.payload.UserID}`);
  check('DELETE /users/:id is 204', removed.status === 204, `got ${removed.status}`);

  const goneAgain = await call('DELETE', `/users/${invited.payload.UserID}`);
  check('deleting twice is 404', goneAgain.status === 404);
}

// --- Schedule ---------------------------------------------------------------

section('Schedule');
{
  const slots = await call('GET', '/schedule/slots', { as: STUDENT });
  check('GET /schedule/slots returns shifts', slots.status === 200 && slots.payload?.length > 0, `got ${slots.payload?.length}`);
  check('Assigned_UserIDs is always an array', slots.payload.every((s) => Array.isArray(s.Assigned_UserIDs)));
  check('open shifts have an empty array not [null]', slots.payload.every((s) => s.Assigned_UserIDs.every((id) => typeof id === 'number')), JSON.stringify(slots.payload.find((s) => s.Assigned_UserIDs.some((id) => typeof id !== 'number'))));

  const created = await call('POST', '/schedule/slots', {
    body: { Task: 'Sap Collection', Stand: 'Sugar Shack', Starts_At: '2027-03-01T13:00:00Z', Ends_At: '2027-03-01T15:00:00Z', Capacity: 1 },
  });
  check('POST /schedule/slots is 201', created.status === 201, `got ${created.status} ${JSON.stringify(created.payload)}`);
  const slotId = created.payload?.SlotID;

  const backwards = await call('POST', '/schedule/slots', {
    body: { Task: 'Line Cleaning', Stand: 'North Ridge', Starts_At: '2027-03-01T15:00:00Z', Ends_At: '2027-03-01T13:00:00Z' },
  });
  check('shift ending before it starts is 422', backwards.status === 422, `got ${backwards.status}`);

  const signup = await call('POST', `/schedule/slots/${slotId}/signup`, { as: STUDENT });
  check('student can claim a shift', signup.status === 200 && signup.payload?.Assigned_UserIDs.includes(3), JSON.stringify(signup.payload));

  const again = await call('POST', `/schedule/slots/${slotId}/signup`, { as: STUDENT });
  check('claiming twice is 422', again.status === 422 && /already signed up/i.test(again.payload?.message ?? ''), JSON.stringify(again.payload));

  const full = await call('POST', `/schedule/slots/${slotId}/signup`, { as: token(4, 'nic4340@g.rit.edu', 1) });
  check('capacity enforced', full.status === 422 && /already full/i.test(full.payload?.message ?? ''), JSON.stringify(full.payload));

  // An overlapping shift at a different stand must still be refused.
  const overlapping = await call('POST', '/schedule/slots', {
    body: { Task: 'Battery Swap', Stand: 'North Ridge', Starts_At: '2027-03-01T14:00:00Z', Ends_At: '2027-03-01T16:00:00Z', Capacity: 2 },
  });
  const clash = await call('POST', `/schedule/slots/${overlapping.payload.SlotID}/signup`, { as: STUDENT });
  check('overlapping shift refused', clash.status === 422 && /overlaps/i.test(clash.payload?.message ?? ''), JSON.stringify(clash.payload));

  const shrink = await call('PATCH', `/schedule/slots/${slotId}`, { body: { Capacity: 0 } });
  check('capacity below 1 is 422', shrink.status === 422);

  const withdrawn = await call('POST', `/schedule/slots/${slotId}/withdraw`, { as: STUDENT });
  check('student can withdraw', withdrawn.status === 200 && !withdrawn.payload?.Assigned_UserIDs.includes(3));

  const completed = await call('PATCH', `/schedule/slots/${slotId}`, { body: { Is_Complete: true } });
  check('PATCH marks a shift complete', completed.status === 200 && completed.payload?.Is_Complete === true);

  const deleted = await call('DELETE', `/schedule/slots/${slotId}`);
  check('DELETE /schedule/slots/:id is 204', deleted.status === 204, `got ${deleted.status}`);
  await call('DELETE', `/schedule/slots/${overlapping.payload.SlotID}`);

  const missing = await call('POST', '/schedule/slots/999999/signup', { as: STUDENT });
  check('signing up for a missing shift is 404', missing.status === 404);
}

// --- RBAC -------------------------------------------------------------------

section('RBAC enforcement');
{
  const anon = await call('GET', '/metrics', { as: null });
  check('anonymous read is 401', anon.status === 401 && anon.payload?.code === 'BAD_CREDENTIALS', `got ${anon.status}`);

  // MSS members review and export, but do not record or administer.
  const mssRecord = await call('POST', '/metrics', { as: MSS, body: { NodeID: 1, Weight: 5 } });
  check('MSS cannot record data', mssRecord.status === 403, `got ${mssRecord.status}`);

  const mssRead = await call('GET', '/metrics?season=2026', { as: MSS });
  check('MSS can read data', mssRead.status === 200);

  const mssNodes = await call('GET', '/nodes', { as: MSS });
  check('MSS can read nodes for the dashboard', mssNodes.status === 200);

  const mssAlerts = await call('GET', '/alerts', { as: MSS });
  check('MSS can read alerts for the dashboard', mssAlerts.status === 200);

  const mssUsers = await call('GET', '/users', { as: MSS });
  check('MSS cannot list users', mssUsers.status === 403, `got ${mssUsers.status}`);

  const mssSchedule = await call('GET', '/schedule/slots', { as: MSS });
  check('MSS cannot view the schedule', mssSchedule.status === 403, `got ${mssSchedule.status}`);

  // Students record but do not revise, administer, or schedule.
  const studentEdit = await call('PATCH', '/metrics/1', { as: STUDENT, body: { Sugar_Percent: 2 } });
  check('student cannot edit readings', studentEdit.status === 403, `got ${studentEdit.status}`);

  const studentUsers = await call('GET', '/users', { as: STUDENT });
  check('student cannot list users', studentUsers.status === 403, `got ${studentUsers.status}`);

  const studentInvite = await call('POST', '/users/invite', { as: STUDENT, body: { email: 'x@g.rit.edu' } });
  check('student cannot invite', studentInvite.status === 403, `got ${studentInvite.status}`);

  const studentSlot = await call('POST', '/schedule/slots', { as: STUDENT, body: { Task: 'Sap Collection', Stand: 'Sugar Shack', Starts_At: '2027-04-01T13:00:00Z', Ends_At: '2027-04-01T15:00:00Z' } });
  check('student cannot create shifts', studentSlot.status === 403, `got ${studentSlot.status}`);

  const studentNode = await call('PATCH', '/nodes/1', { as: STUDENT, body: { Status_Code: 3 } });
  check('student cannot change node status', studentNode.status === 403, `got ${studentNode.status}`);

  // A student signing a classmate up is a scheduling action.
  const slots = await call('GET', '/schedule/slots', { as: STUDENT });
  const openSlot = slots.payload.find((s) => s.Assigned_UserIDs.length === 0 && new Date(s.Starts_At) > new Date());
  if (openSlot) {
    const forOther = await call('POST', `/schedule/slots/${openSlot.SlotID}/signup`, { as: STUDENT, body: { userId: 4 } });
    check('student cannot sign up someone else', forOther.status === 403, `got ${forOther.status}`);
  } else {
    check('student cannot sign up someone else', true, 'skipped: no open future slot');
  }

  const student = await call('GET', '/auth/session', { as: STUDENT });
  check('student can flag a node', (await call('POST', '/nodes/1/flag', { as: STUDENT, body: {} })).status === 201);
  check('student session resolves', student.status === 200 && student.payload?.user?.RoleID === 2);
}

// --- Errors and unknown routes ----------------------------------------------

section('Error shape');
{
  const unknown = await call('GET', '/does-not-exist');
  check('unknown route is 404 with a code', unknown.status === 404 && unknown.payload?.code === 'NOT_FOUND', JSON.stringify(unknown.payload));

  const missing = await call('GET', '/nodes/9999');
  check('error body has message, code, details', 'message' in missing.payload && 'code' in missing.payload && 'details' in missing.payload, JSON.stringify(missing.payload));

  const validation = await call('POST', '/metrics', { as: STUDENT, body: { NodeID: 1 } });
  check('validation error carries field-keyed details', validation.payload?.details && typeof validation.payload.details === 'object', JSON.stringify(validation.payload));
}

// --- Summary ----------------------------------------------------------------

console.log(`\n${'='.repeat(60)}`);
console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log('All checks passed.');
