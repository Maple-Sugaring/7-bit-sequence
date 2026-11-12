/**
 * FR-036 over real HTTP: the trace view is admin-only, every response carries
 * a request id, and routed requests leave an activity row with the route,
 * entity, outcome and caller, but no secrets and no duplicate rows.
 */

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, beforeEach, describe, mock, test } from 'node:test';

import '../env.js';
import { signAccessToken } from '../../src/auth/jwt.js';
import { closePool, pool } from '../../src/db/pool.js';

const usersById = new Map();
let activityRows = [];

function userRow(id, roleId) {
  return {
    id,
    role_id: roleId,
    first_name: 'Test',
    last_name: `User ${id}`,
    email: `user${id}@rit.edu`,
    created_at: '2026-01-15',
    last_login: null,
    is_active: true,
    account_expiry: '2099-06-01T00:00:00.000Z',
    can_overwrite_measurements: true,
  };
}

// Columns in insertActivity's order.
const ACTIVITY_COLUMNS = [
  'received_at', 'request_id', 'kind', 'operation', 'outcome', 'actor_user_id',
  'gateway_id', 'entity_type', 'entity_id', 'node_id', 'row_count', 'duration_ms', 'detail',
];

mock.method(pool, 'query', async (text, params = []) => {
  const sql = String(text);
  if (sql.includes('insert into activity_events')) {
    const row = Object.fromEntries(ACTIVITY_COLUMNS.map((column, index) => [column, params[index]]));
    row.detail = JSON.parse(row.detail);
    activityRows.push(row);
    return { rows: [], rowCount: 1 };
  }
  if (sql.includes('from activity_events')) return { rows: [], rowCount: 0 };
  if (sql.includes('where id =')) {
    const row = usersById.get(Number(params[0]));
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }
  return { rows: [], rowCount: 0 };
});
mock.method(pool, 'connect', async () => ({ query: pool.query.bind(pool), release() {} }));

let server;
let baseUrl;

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

beforeEach(() => {
  activityRows = [];
});

function tokenFor(id, roleId) {
  usersById.set(id, userRow(id, roleId));
  return signAccessToken({ UserID: id, Email: `user${id}@rit.edu`, RoleID: roleId });
}

const admin = () => tokenFor(1, 1);
const student = () => tokenFor(5, 2);

async function send(path, { method = 'GET', token, body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  await response.text();
  return response;
}

/** Activity is written after the response, so give the finish hook a moment. */
async function settled(predicate = () => true) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const rows = activityRows.filter(predicate);
    if (rows.length) return rows;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return activityRows.filter(predicate);
}

describe('activity trace access', () => {
  for (const path of ['/activity-events', '/activity-events/policy', '/activity-events/metrics/1']) {
    test(`${path} needs a session`, async () => {
      assert.equal((await send(path)).status, 401);
    });

    test(`${path} is refused to a student`, async () => {
      assert.equal((await send(path, { token: student() })).status, 403);
    });
  }

  test('an admin can list activity and read the policy', async () => {
    const list = await fetch(`${baseUrl}/activity-events`, { headers: { authorization: `Bearer ${admin()}` } });
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), { items: [], next: null });

    const policy = await fetch(`${baseUrl}/activity-events/policy`, { headers: { authorization: `Bearer ${admin()}` } });
    const body = await policy.json();
    assert.equal(typeof body.Retention_Days, 'number');
    assert.ok(body.Timestamps.Recorded_At && body.Timestamps.Received_At && body.Timestamps.Created_At);
  });

  test('a trace for a reading with no history is 404', async () => {
    assert.equal((await send('/activity-events/metrics/999', { token: admin() })).status, 404);
  });

  test('opening the activity list is itself recorded, once', async () => {
    await send('/activity-events?kind=read', { token: admin() });
    const rows = await settled();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(activityRows.length, 1, 'no generic row on top of the route\'s own');
    assert.equal(rows[0].operation, 'activity.list');
    assert.equal(rows[0].actor_user_id, 1);
  });
});

describe('request correlation over HTTP', () => {
  test('every response carries an X-Request-Id, and a sane caller id is kept', async () => {
    const fresh = await send('/health');
    assert.match(fresh.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
    const kept = await send('/health', { headers: { 'x-request-id': 'gw-alumni-000042' } });
    assert.equal(kept.headers.get('x-request-id'), 'gw-alumni-000042');
  });

  test('a read is recorded with its route, caller, request id and receipt time', async () => {
    const response = await send('/users?nodeId=3', { token: admin() });
    const [row] = await settled((item) => item.operation === 'GET /users');
    assert.equal(row.kind, 'read');
    assert.equal(row.outcome, 'ok');
    assert.equal(row.actor_user_id, 1);
    assert.equal(row.request_id, response.headers.get('x-request-id'));
    assert.ok(Date.now() - new Date(row.received_at).getTime() < 5000);
    assert.equal(row.node_id, 3);
    assert.equal(row.detail.status, 200);
    assert.ok(row.duration_ms >= 0);
  });

  test('a rejected write still names its route and entity', async () => {
    await send('/nodes/7', { method: 'PATCH', token: admin(), body: { Node_Name: '' } });
    const [row] = await settled((item) => item.kind === 'write');
    assert.equal(row.operation, 'PATCH /nodes/:id');
    assert.equal(row.outcome, 'rejected');
    assert.equal(row.entity_type, 'node');
    assert.equal(row.entity_id, 7);
    assert.equal(row.node_id, 7);
    assert.equal(row.detail.status, 422);
  });

  test('a refused request is recorded against the caller', async () => {
    await send('/users', { token: student() });
    const [row] = await settled((item) => item.operation === 'GET /users');
    assert.equal(row.outcome, 'rejected');
    assert.equal(row.actor_user_id, 5);
    assert.equal(row.detail.status, 403);
  });

  test('query values that look sensitive are not stored', async () => {
    await send('/users?email=someone%40rit.edu&token=abc&nodeId=2', { token: admin() });
    const [row] = await settled((item) => item.operation === 'GET /users');
    assert.deepEqual(row.detail.query, { nodeId: '2' });
  });

  test('sign-in, health checks and unknown paths are not recorded', async () => {
    await send('/health');
    await send('/auth/session');
    await send('/no-such-route', { token: admin() });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.deepEqual(activityRows, []);
  });

  test('GET /metrics records its richer read event and no generic row', async () => {
    await send('/metrics?nodeId=4', { token: admin() });
    await settled();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(activityRows.map((row) => row.operation), ['metrics.list']);
    assert.equal(activityRows[0].node_id, 4);
  });
});
