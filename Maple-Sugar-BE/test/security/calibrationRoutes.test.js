import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mock, after, before, beforeEach, describe, test } from 'node:test';

import '../env.js';
import { signAccessToken } from '../../src/auth/jwt.js';
import { pool, closePool } from '../../src/db/pool.js';

/**
 * Stand-in for Postgres: sessions, one node, its calibration commands, its
 * newest reading and its open alerts. Command lookups are answered by applying
 * the query's filters to the rows, so each repository query gets its own answer.
 */
const users = new Map();
let commands;
let latestMetric;
let alerts;

function userRow(id, role_id) {
  return {
    id,
    role_id,
    first_name: 'T',
    last_name: 'User',
    email: `u${id}@rit.edu`,
    created_at: '2026-01-15',
    last_login: null,
    is_active: true,
    account_expiry: '2099-06-01T00:00:00.000Z',
    google_calendar_id: null,
    calendar_connected: false,
    invite_pending: false,
  };
}

const node = {
  id: 1,
  gateway_id: 1,
  node_code: 'NODE-001',
  lora_device_id: null,
  node_name: 'Bench - Tree 1',
  status_code: 1,
  battery_level: 90,
  signal_rssi: -70,
  latitude: null,
  longitude: null,
  stand: 'Bench',
  last_seen: '2026-10-25T23:59:10.000Z',
  report_interval_seconds: 10,
  tracked: true,
};

function commandRow(overrides) {
  return {
    node_id: 1,
    pounds: null,
    counts_per_lb: null,
    requested_by_user_id: 1,
    created_at: '2026-10-25T23:50:00.000Z',
    sent_at: null,
    completed_at: null,
    ...overrides,
  };
}

const OPEN = ['pending', 'sent'];

function selectCommand(sql) {
  let rows = commands.filter((row) => row.node_id === node.id);
  if (sql.includes("status in ('pending', 'sent')")) rows = rows.filter((row) => OPEN.includes(row.status));
  if (sql.includes("action = 'calibrate'")) rows = rows.filter((row) => row.action === 'calibrate');
  if (sql.includes("status = 'done'")) rows = rows.filter((row) => row.status === 'done');
  if (sql.includes('counts_per_lb is not null')) rows = rows.filter((row) => row.counts_per_lb != null);
  const row = [...rows].sort((a, b) => b.id - a.id)[0];
  return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
}

async function answer(text, params = []) {
  const sql = String(text);
  if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [], rowCount: 0 };
  if (sql.includes('from users')) {
    const row = users.get(Number(params[0]));
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }
  if (sql.includes('from node where id')) {
    const found = Number(params[0]) === node.id;
    return { rows: found ? [node] : [], rowCount: found ? 1 : 0 };
  }
  if (sql.includes('update calibration_commands') && sql.includes("status = 'cancelled'")) {
    const open = commands.filter((row) => row.node_id === Number(params[0]) && OPEN.includes(row.status));
    for (const row of open) Object.assign(row, { status: 'cancelled', completed_at: '2026-10-26T00:00:00.000Z' });
    return { rows: open, rowCount: open.length };
  }
  if (sql.includes('from calibration_commands')) return selectCommand(sql);
  if (sql.includes('from metrics')) {
    return latestMetric ? { rows: [latestMetric], rowCount: 1 } : { rows: [], rowCount: 0 };
  }
  if (sql.includes('from alerts')) {
    const open = alerts
      .filter((row) => !row.is_resolved && params[1].includes(row.alert_type))
      .sort((a, b) => b.id - a.id);
    return { rows: open.slice(0, 1), rowCount: Math.min(open.length, 1) };
  }
  return { rows: [], rowCount: 0 };
}

mock.method(pool, 'query', answer);
mock.method(pool, 'connect', async () => ({ query: answer, release() {} }));

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

beforeEach(() => {
  commands = [];
  latestMetric = null;
  alerts = [];
});

function token(id, role_id) {
  users.set(id, userRow(id, role_id));
  return signAccessToken({ UserID: id, Email: `u${id}@rit.edu`, RoleID: role_id });
}

async function send(path, { method = 'GET', tok } = {}) {
  const headers = { accept: 'application/json' };
  if (tok) headers.authorization = `Bearer ${tok}`;
  const response = await fetch(`${baseUrl}${path}`, { method, headers });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
}

describe('GET /nodes/:id/calibration', () => {
  test('reports what the platform reads now and the fault the node is sending', async () => {
    latestMetric = { id: 5, node_id: 1, recorded_at: '2026-10-25T23:58:40.000Z', weight: '4.640' };
    alerts = [
      { id: 3, node_id: 1, alert_type: 'Unstable Reading', message: 'Samples disagreed.', is_resolved: false, created_at: '2026-10-25T23:59:10.000Z' },
    ];
    const response = await send('/nodes/1/calibration', { tok: token(1, 1) });
    assert.equal(response.status, 200);
    assert.deepEqual(response.json.Live, {
      Weight: 4.64,
      Recorded_At: '2026-10-25T23:58:40.000Z',
      Last_Seen: '2026-10-25T23:59:10.000Z',
      Fault: { Code: 'unstable', Description: 'Samples disagreed.', Since: '2026-10-25T23:59:10.000Z' },
    });
  });

  test("reports the node's scale factor from its latest ack, a tare included", async () => {
    commands = [
      commandRow({ id: 10, action: 'calibrate', pounds: '16.800', status: 'done', counts_per_lb: '7898' }),
      commandRow({ id: 11, action: 'tare', status: 'done', counts_per_lb: '7901', completed_at: '2026-10-25T23:55:00.000Z' }),
      commandRow({ id: 12, action: 'tare', status: 'cancelled' }),
    ];
    const response = await send('/nodes/1/calibration', { tok: token(1, 1) });
    assert.equal(response.status, 200);
    assert.equal(response.json.Command.CommandID, 12);
    assert.equal(response.json.Last_Calibration.CommandID, 10);
    assert.equal(response.json.Last_Scale.CommandID, 11);
    assert.equal(response.json.Last_Scale.Counts_Per_Lb, 7901);
  });
});

describe('DELETE /nodes/:id/calibration', () => {
  test('cancels the waiting command so the next reply no longer carries it', async () => {
    commands = [commandRow({ id: 20, action: 'calibrate', pounds: '16.800', status: 'sent', sent_at: '2026-10-25T23:51:00.000Z' })];
    const response = await send('/nodes/1/calibration', { method: 'DELETE', tok: token(1, 1) });
    assert.equal(response.status, 200);
    assert.equal(response.json.CommandID, 20);
    assert.equal(response.json.Status, 'cancelled');
    assert.equal(commands[0].status, 'cancelled');
  });

  test('returns the settled command untouched when the node answered first', async () => {
    commands = [commandRow({ id: 21, action: 'tare', status: 'done', counts_per_lb: '7898' })];
    const response = await send('/nodes/1/calibration', { method: 'DELETE', tok: token(1, 1) });
    assert.equal(response.status, 200);
    assert.equal(response.json.CommandID, 21);
    assert.equal(response.json.Status, 'done');
  });

  test('needs the deploy capability and a real node', async () => {
    const student = await send('/nodes/1/calibration', { method: 'DELETE', tok: token(2, 2) });
    assert.equal(student.status, 403);
    const missing = await send('/nodes/99/calibration', { method: 'DELETE', tok: token(1, 1) });
    assert.equal(missing.status, 404);
  });
});
