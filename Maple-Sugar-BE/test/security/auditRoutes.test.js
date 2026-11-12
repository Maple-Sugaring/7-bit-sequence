import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mock, after, before, beforeEach, describe, test } from 'node:test';

import '../env.js';
import { signAccessToken } from '../../src/auth/jwt.js';
import { pool, closePool } from '../../src/db/pool.js';

/**
 * Admin actions write their audit row in the same transaction as the change
 * (matching the mock API's audit_events). Postgres is stubbed: updates apply
 * their `column = $n` assignments to in-memory rows, and every statement is
 * logged so a test can see what committed and what rolled back.
 */
let users;
let node;
let commands;
let alerts;
let audits;
let statements;
let failAudit;

function userRow(id, role_id, overrides = {}) {
  return {
    id,
    role_id,
    first_name: 'T',
    last_name: 'User',
    email: `u${id}@rit.edu`,
    created_at: '2026-01-15',
    last_login: null,
    is_active: true,
    can_overwrite_measurements: false,
    account_expiry: '2099-06-01T00:00:00.000Z',
    google_calendar_id: null,
    calendar_connected: false,
    invite_pending: false,
    ...overrides,
  };
}

function nodeRow() {
  return {
    id: 1,
    gateway_id: 1,
    node_code: 'NODE-001',
    lora_device_id: null,
    node_name: 'Bench - Tree 1',
    rf_tag: null,
    notes: null,
    status_code: 1,
    battery_level: 90,
    signal_rssi: -70,
    latitude: 43.08,
    longitude: -77.67,
    stand: 'Bench',
    last_seen: '2026-10-25T23:59:10.000Z',
    report_interval_seconds: 60,
    tracked: true,
  };
}

/** Applies `column = $n` pairs from an UPDATE's SET clause to `row`. */
function applySet(sql, params, row) {
  const set = sql.slice(sql.indexOf(' set ') + 5, sql.indexOf(' where '));
  for (const [, column, index] of set.matchAll(/(\w+) = \$(\d+)/g)) row[column] = params[Number(index) - 1];
}

const one = (row) => ({ rows: row ? [row] : [], rowCount: row ? 1 : 0 });
const OPEN = ['pending', 'sent'];

async function answer(text, params = []) {
  const sql = String(text).replace(/\s+/g, ' ').trim();
  statements.push(sql.split(' ')[0]);
  if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [], rowCount: 0 };

  if (sql.startsWith('insert into audit_events')) {
    if (failAudit) throw new Error('audit insert failed');
    const [event_type, actor_id, target_id, note] = params;
    audits.push({ event_type, actor_id, target_id, note });
    return { rows: [], rowCount: 1 };
  }

  if (sql.startsWith('update users')) {
    const row = users.get(Number(params[0]));
    if (row) applySet(sql, params, row);
    return one(row);
  }
  if (sql.includes('from users')) return one(users.get(Number(params[0])));

  if (sql.startsWith('update node set')) {
    if (Number(params[0]) !== node?.id) return one(null);
    applySet(sql, params, node);
    return one(node);
  }
  if (sql.includes('from visible_nodes where id') || sql.includes('from node where id')) {
    return one(Number(params[0]) === node?.id ? node : null);
  }
  if (sql.startsWith('delete from node')) {
    node = null;
    return { rows: [], rowCount: 1 };
  }

  if (sql.startsWith('update calibration_commands') && sql.includes("status = 'cancelled'")) {
    const open = commands.filter((row) => OPEN.includes(row.status));
    for (const row of open) row.status = 'cancelled';
    return { rows: open, rowCount: open.length };
  }
  if (sql.startsWith('insert into calibration_commands')) {
    const [node_id, action, pounds, requested_by_user_id] = params;
    const row = { id: commands.length + 1, node_id, action, pounds, status: 'pending', requested_by_user_id, created_at: '2026-10-26T00:00:00.000Z' };
    commands.push(row);
    return one(row);
  }

  if (sql.startsWith('insert into alerts')) {
    const [node_id, alert_type, severity, message] = params;
    // demo_node keeps createAlert from starting a notification in the test.
    const row = { id: alerts.length + 1, node_id, alert_type, severity, message, is_resolved: false, created_at: '2026-10-26T00:00:00.000Z', demo_node: true };
    alerts.push(row);
    return one(row);
  }
  if (sql.startsWith('select a.is_resolved')) {
    const row = alerts.find((alert) => alert.id === Number(params[0]));
    return one(row && { is_resolved: row.is_resolved, alert_type: row.alert_type, node_name: node?.node_name ?? null });
  }
  if (sql.startsWith('update alerts set is_resolved')) {
    const row = alerts.find((alert) => alert.id === Number(params[0]));
    if (row) row.is_resolved = params[1];
    return one(row);
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
  users = new Map();
  node = nodeRow();
  commands = [];
  alerts = [];
  audits = [];
  statements = [];
  failAudit = false;
});

const ADMIN = 1;

function token(id = ADMIN, role_id = 1) {
  if (!users.has(id)) users.set(id, userRow(id, role_id));
  return signAccessToken({ UserID: id, Email: `u${id}@rit.edu`, RoleID: role_id });
}

async function send(path, { method = 'GET', body, tok = token() } = {}) {
  const headers = { accept: 'application/json', authorization: `Bearer ${tok}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
}

describe('node actions write an audit row', () => {
  test('parking a node and returning it to service', async () => {
    assert.equal((await send('/nodes/1/actions', { method: 'POST', body: { Action: 'maintenance' } })).status, 200);
    assert.equal((await send('/nodes/1/actions', { method: 'POST', body: { Action: 'online' } })).status, 200);
    assert.deepEqual(audits, [
      { event_type: 'node_maintenance', actor_id: ADMIN, target_id: 1, note: 'Bench - Tree 1 parked in maintenance.' },
      { event_type: 'node_online', actor_id: ADMIN, target_id: 1, note: 'Bench - Tree 1 returned to service.' },
    ]);
  });

  test('editing details names the fields that changed', async () => {
    const response = await send('/nodes/1/details', {
      method: 'PATCH',
      body: { Node_Name: 'Bench - Tree 1', Stand: 'Alumni House', Latitude: 43.08, Longitude: -77.67, Notes: 'New tap' },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(audits, [{ event_type: 'node_edited', actor_id: ADMIN, target_id: 1, note: 'Changed Stand, Notes.' }]);
  });

  test('changing the report interval records old and new values', async () => {
    assert.equal((await send('/nodes/1/interval', { method: 'PATCH', body: { Report_Interval_Seconds: 300 } })).status, 200);
    assert.equal(audits[0].event_type, 'node_interval_changed');
    assert.equal(audits[0].note, 'Report interval 60s to 300s.');
  });

  test('removing a node', async () => {
    assert.equal((await send('/nodes/1', { method: 'DELETE' })).status, 204);
    assert.deepEqual(audits, [{ event_type: 'node_deleted', actor_id: ADMIN, target_id: 1, note: 'Bench - Tree 1 (NODE-001) removed.' }]);
  });

  test('flagging a node', async () => {
    const response = await send('/nodes/1/flag', { method: 'POST', body: { type: 'Cracked Bucket', description: 'Bucket split along the seam.' } });
    assert.equal(response.status, 201);
    assert.deepEqual(audits, [{ event_type: 'node_flagged', actor_id: ADMIN, target_id: 1, note: 'Bucket split along the seam.' }]);
  });
});

describe('calibration writes an audit row', () => {
  test('tare and calibrate are recorded when queued', async () => {
    assert.equal((await send('/nodes/1/calibration', { method: 'POST', body: { Action: 'tare' } })).status, 202);
    assert.equal((await send('/nodes/1/calibration', { method: 'POST', body: { Action: 'calibrate', Pounds: 16.8 } })).status, 202);
    assert.deepEqual(audits.map((row) => [row.event_type, row.note]), [
      ['node_tare', 'Tare sent to Bench - Tree 1.'],
      ['node_calibrate', 'Calibrate Bench - Tree 1 to 16.8 lb.'],
    ]);
  });

  test('cancelling records only when something was waiting', async () => {
    assert.equal((await send('/nodes/1/calibration', { method: 'DELETE' })).status, 200);
    assert.deepEqual(audits, []);

    commands = [{ id: 7, node_id: 1, action: 'tare', pounds: null, status: 'sent', created_at: '2026-10-26T00:00:00.000Z' }];
    assert.equal((await send('/nodes/1/calibration', { method: 'DELETE' })).status, 200);
    assert.deepEqual(audits, [{ event_type: 'calibration_cancelled', actor_id: ADMIN, target_id: 1, note: 'Cancelled the waiting tare for Bench - Tree 1.' }]);
  });
});

describe('alerts and users write an audit row', () => {
  test('resolving and reopening an alert, but not a no-op', async () => {
    alerts = [{ id: 4, node_id: 1, alert_type: 'Full Bucket', severity: 'warning', message: 'Full.', is_resolved: false, created_at: '2026-10-26T00:00:00.000Z' }];
    assert.equal((await send('/alerts/4', { method: 'PATCH', body: { Is_Resolved: true } })).status, 200);
    assert.equal((await send('/alerts/4', { method: 'PATCH', body: { Is_Resolved: true } })).status, 200);
    assert.equal((await send('/alerts/4', { method: 'PATCH', body: { Is_Resolved: false } })).status, 200);
    assert.deepEqual(audits.map((row) => [row.event_type, row.target_id, row.note]), [
      ['alert_resolved', 4, 'Full Bucket at Bench - Tree 1.'],
      ['alert_reopened', 4, 'Full Bucket at Bench - Tree 1.'],
    ]);
  });

  test('updating a user lists the changed fields, not their values', async () => {
    users.set(5, userRow(5, 2, { first_name: 'Sam', last_name: 'Lee' }));
    assert.equal((await send('/users/5', { method: 'PATCH', body: { RoleID: 3, First_Name: 'Sam' } })).status, 200);
    assert.deepEqual(audits, [{ event_type: 'user_updated', actor_id: ADMIN, target_id: 5, note: 'Sam Lee: changed RoleID.' }]);

    assert.equal((await send('/users/5', { method: 'PATCH', body: { First_Name: 'Sam' } })).status, 200);
    assert.equal(audits.length, 1);
  });
});

describe('the change and its audit row commit together', () => {
  test('a failed audit insert rolls the change back', async () => {
    failAudit = true;
    const response = await send('/nodes/1/interval', { method: 'PATCH', body: { Report_Interval_Seconds: 300 } });
    assert.equal(response.status, 500);
    assert.ok(statements.includes('ROLLBACK'));
    assert.equal(statements.includes('COMMIT'), false);
  });
});
