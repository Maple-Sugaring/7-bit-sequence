import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mock, after, before, describe, test } from 'node:test';

import '../env.js';
import { signSessionToken } from '../../src/auth/jwt.js';
import { config } from '../../src/config.js';
import { pool, closePool } from '../../src/db/pool.js';
import { readThrough } from '../../src/cache/redisCache.js';
import { hashFilters } from '../../src/cache/cacheKeys.js';

/**
 * Stand-in for Postgres. Session lookup and the health probe are the only
 * statements these tests need answered; everything else comes back empty so a
 * handler that forgets to authorize cannot accidentally write.
 */
const usersById = new Map();
let databaseUp = true;
let failQueries = false;
const queries = [];

function userRow(overrides) {
  return {
    id: 1,
    role_id: 1,
    first_name: 'Ada',
    last_name: 'Admin',
    email: 'ada@rit.edu',
    created_at: '2026-01-15',
    last_login: null,
    is_active: true,
    account_expiry: '2099-06-01T00:00:00.000Z',
    google_calendar_id: null,
    calendar_connected: false,
    invite_pending: false,
    ...overrides,
  };
}

mock.method(pool, 'query', async (text, params = []) => {
  const sql = String(text);
  queries.push({ sql, params });
  if (failQueries) throw new Error('relation "secret_internal" does not exist');
  if (!databaseUp) throw new Error('connection refused to 127.0.0.1:1');
  if (sql.includes('select 1')) return { rows: [{ ok: 1 }], rowCount: 1 };
  if (sql.includes('where id =')) {
    const row = usersById.get(Number(params[0]));
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }
  if (sql.includes('lower(email)')) return { rows: [], rowCount: 0 };
  if (sql.startsWith('insert into users') || sql.includes('insert into users')) {
    const row = userRow({
      id: 20,
      role_id: params[0],
      first_name: params[1],
      last_name: params[2],
      email: params[3],
      invite_pending: true,
    });
    return { rows: [row], rowCount: 1 };
  }
  return { rows: [], rowCount: 0 };
});

let baseUrl;
let server;

before(async () => {
  const { createApp } = await import('../../src/app.js');
  server = createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await closePool();
});

function tokenFor(row) {
  usersById.set(row.id, row);
  return signSessionToken({ UserID: row.id, Email: row.email, RoleID: row.role_id });
}

async function send(path, { method = 'GET', token, cookie, origin, body, raw } = {}) {
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  if (body !== undefined || raw !== undefined) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    redirect: 'manual',
  });
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: response.status, headers: response.headers, json, text };
}

describe('edge headers and health', () => {
  test('health reports the database and does not advertise the server', async () => {
    databaseUp = true;
    const response = await send('/health');
    assert.equal(response.status, 200);
    assert.equal(response.json.status, 'ok');
    assert.equal(response.json.database, true);
    assert.equal(response.json.cache.connected, false);
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });

  test('a database outage is unhealthy and a cache miss still serves', async () => {
    databaseUp = false;
    const down = await send('/health');
    assert.equal(down.status, 503);
    assert.equal(down.json.status, 'unhealthy');
    assert.equal(down.json.database, false);
    databaseUp = true;

    let loads = 0;
    const value = await readThrough('metrics:list:all', 30, async () => {
      loads += 1;
      return [{ MetricID: 1 }];
    });
    assert.equal(loads, 1);
    assert.deepEqual(value, [{ MetricID: 1 }]);
    assert.equal(hashFilters({ season: 2026, nodeId: '', from: undefined }), 'season=2026');
  });

  test('reflects only the configured web origin and allows credentials there', async () => {
    const allowed = await send('/auth/session', { origin: config.publicWebUrl });
    assert.equal(allowed.headers.get('access-control-allow-origin'), config.publicWebUrl);
    assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');

    const foreign = await send('/auth/session', { origin: 'https://evil.example' });
    assert.notEqual(foreign.headers.get('access-control-allow-origin'), 'https://evil.example');
    assert.equal(foreign.json, null);
  });
});

describe('session and OAuth', () => {
  test('an anonymous session is null and logout clears the cookie', async () => {
    const session = await send('/auth/session');
    assert.equal(session.status, 200);
    assert.equal(session.json, null);

    const logout = await send('/auth/logout', { method: 'POST' });
    assert.equal(logout.status, 204);
    const cleared = logout.headers.get('set-cookie') ?? '';
    assert.match(cleared, /maple_session=/);
    assert.match(cleared, /HttpOnly/i);
  });

  test('a bearer token loads the account, and a dead account does not', async () => {
    const admin = tokenFor(userRow({ id: 1, role_id: 1, email: 'ada@rit.edu' }));
    const session = await send('/auth/session', { token: admin });
    assert.equal(session.status, 200);
    assert.equal(session.json.user.Email, 'ada@rit.edu');
    assert.equal(JSON.stringify(session.json).includes('refresh'), false);
    assert.equal(JSON.stringify(session.json).includes('password'), false);

    const expired = tokenFor(
      userRow({ id: 2, role_id: 2, email: 'old@rit.edu', account_expiry: '2020-01-01T00:00:00.000Z' }),
    );
    const inactive = tokenFor(userRow({ id: 3, role_id: 2, email: 'off@rit.edu', is_active: false }));
    assert.equal((await send('/auth/session', { token: expired })).json, null);
    assert.equal((await send('/auth/session', { token: inactive })).json, null);
    assert.equal((await send('/auth/session', { token: 'not-a-jwt' })).json, null);
  });

  test('a bad session cookie is not rescued by a valid bearer token', async () => {
    const admin = tokenFor(userRow({ id: 1, role_id: 1 }));
    const response = await send('/users', { token: admin, cookie: 'maple_session=garbage' });
    assert.equal(response.status, 401);
  });

  test('starting Google sign-in sets an httpOnly state cookie and hides the secret', async () => {
    const response = await send('/auth/google');
    assert.equal(response.status, 302);
    const location = response.headers.get('location');
    assert.match(location, /accounts\.google\.com/);
    assert.equal(location.includes(config.google.clientSecret), false);
    const cookie = response.headers.get('set-cookie');
    assert.match(cookie, /maple_oauth_state=/);
    assert.match(cookie, /HttpOnly/i);
  });

  test('a callback with a mismatched state redirects home and sets no session', async () => {
    const response = await send('/auth/google/callback?code=abc&state=forged');
    assert.equal(response.status, 302);
    const location = response.headers.get('location');
    assert.match(location, /\/login\?/);
    assert.match(location, /error=/);
    const cookie = response.headers.get('set-cookie') ?? '';
    assert.equal(cookie.includes('maple_session='), false);
  });

  test('there is no password login route', async () => {
    const response = await send('/auth/login', {
      method: 'POST',
      body: { email: 'ada@rit.edu', password: 'hunter2' },
    });
    assert.equal(response.status, 404);
    assert.equal(response.json.code, 'NOT_FOUND');
    assert.equal(response.text.includes('hunter2'), false);
  });
});

describe('authorization over HTTP', () => {
  test('students and MSS members are stopped before a privileged handler runs', async () => {
    const student = tokenFor(userRow({ id: 5, role_id: 2, email: 'sam@g.rit.edu' }));
    const mss = tokenFor(userRow({ id: 8, role_id: 3, email: 'mss@rit.edu' }));

    assert.equal((await send('/users', { token: student })).status, 403);
    assert.equal((await send('/schedule/slots', { token: mss })).status, 403);
    assert.equal((await send('/metrics', { method: 'POST', token: mss, body: { NodeID: 1 } })).status, 403);
    assert.equal(
      (await send('/metrics/4', { method: 'PATCH', token: student, body: { Weight: 1 } })).status,
      403,
    );
    assert.equal((await send('/users')).status, 401);
  });

  test('an admin cannot demote or delete their own account', async () => {
    const admin = tokenFor(userRow({ id: 1, role_id: 1 }));
    const demote = await send('/users/1', { method: 'PATCH', token: admin, body: { RoleID: 2 } });
    const remove = await send('/users/1', { method: 'DELETE', token: admin });
    assert.equal(demote.status, 403);
    assert.match(demote.json.message, /own role/);
    assert.equal(remove.status, 403);
    assert.match(remove.json.message, /own account/);
  });

  test('a bad reading is a field error, and a bad id never reaches SQL', async () => {
    const student = tokenFor(userRow({ id: 5, role_id: 2, email: 'sam@g.rit.edu' }));
    const reading = await send('/metrics', {
      method: 'POST',
      token: student,
      body: { NodeID: 1, Sugar_Percent: 50, Weight: 10 },
    });
    assert.equal(reading.status, 422);
    assert.match(reading.json.details.Sugar_Percent, /0\.5% and 12%/);

    queries.length = 0;
    const injected = await send('/nodes/0', { token: student });
    assert.equal(injected.status, 422);
    assert.equal(
      queries.some((query) => query.sql.includes('from node')),
      false,
    );
  });

  test('an invite keeps untrusted text in parameters', async () => {
    const admin = tokenFor(userRow({ id: 1, role_id: 1 }));
    const payload = "x'; drop table users;--";
    queries.length = 0;
    const response = await send('/users/invite', {
      method: 'POST',
      token: admin,
      body: { email: 'newstudent@rit.edu', roleId: 2, firstName: payload },
    });
    assert.equal(response.status, 201);
    assert.equal(
      queries.some((query) => query.sql.toLowerCase().includes('drop table')),
      false,
    );
    assert.equal(
      queries.some((query) => query.params.includes(payload)),
      true,
    );
  });
});

describe('abuse of the request body', () => {
  test('oversized and malformed JSON do not echo the payload', async () => {
    const bulky = await send('/metrics', {
      method: 'POST',
      raw: JSON.stringify({ NodeID: 1, note: 'x'.repeat(300 * 1024) }),
    });
    assert.ok(bulky.status === 413 || bulky.status === 400 || bulky.status === 500);
    assert.equal(bulky.text.includes('x'.repeat(200)), false);
    assert.equal(bulky.text.includes('at '), false);

    const broken = await send('/metrics', { method: 'POST', raw: '{"NodeID":' });
    assert.ok(broken.status >= 400);
    assert.equal(broken.text.includes('node_modules'), false);
  });

  test('an unexpected database error stays generic', async () => {
    const student = tokenFor(userRow({ id: 5, role_id: 2, email: 'sam@g.rit.edu' }));
    failQueries = true;
    try {
      const response = await send('/nodes/1', { token: student });
      assert.equal(response.status, 500);
      assert.equal(response.json.code, 'INTERNAL');
      assert.equal(response.text.includes('secret_internal'), false);
    } finally {
      failQueries = false;
    }
  });

  test('a burst of health and session checks all complete', async () => {
    databaseUp = true;
    const responses = await Promise.all(
      Array.from({ length: 40 }, (_, index) => send(index % 2 === 0 ? '/health' : '/auth/session')),
    );
    assert.equal(responses.length, 40);
    for (const response of responses) {
      assert.ok(response.status === 200);
    }
  });
});
