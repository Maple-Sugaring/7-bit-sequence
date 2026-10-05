import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mock, after, before, beforeEach, describe, test } from 'node:test';

import '../env.js';
import { signSessionToken } from '../../src/auth/jwt.js';
import { pool, closePool } from '../../src/db/pool.js';

/** Stand-in for Postgres: a users table for sessions plus one gateway row. */
const users = new Map();
let gateway;
let queries;

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

function gatewayRow(overrides = {}) {
  return {
    id: 1,
    gateway_code: 'pi-1',
    gateway_name: 'Barn',
    status: 'Online',
    last_ping: null,
    notes: null,
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

async function answer(text, params = []) {
  const sql = String(text);
  queries.push({ sql, params });
  if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [], rowCount: 0 };
  if (sql.includes('from users') || sql.includes('from users u')) {
    const row = users.get(Number(params[0]));
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }
  if (sql.startsWith('update gateway set')) {
    if (!gateway || Number(params[0]) !== gateway.id) return { rows: [], rowCount: 0 };
    if (sql.includes('gateway_code') && params.includes('taken')) {
      throw Object.assign(new Error('duplicate key'), { code: '23505' });
    }
    // Apply `col = $n` assignments so the response reflects what was written.
    for (const match of sql.matchAll(/(\w+) = \$(\d+)/g)) gateway[match[1]] = params[Number(match[2]) - 1];
    return { rows: [gateway], rowCount: 1 };
  }
  if (sql.includes('from gateway where id')) {
    const found = gateway && Number(params[0]) === gateway.id;
    return { rows: found ? [{ id: gateway.id }] : [], rowCount: found ? 1 : 0 };
  }
  if (sql.startsWith('delete from gateway')) {
    gateway = null;
    return { rows: [], rowCount: 1 };
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
  gateway = gatewayRow();
  queries = [];
});

function token(id, role_id) {
  users.set(id, userRow(id, role_id));
  return signSessionToken({ UserID: id, Email: `u${id}@rit.edu`, RoleID: role_id });
}

async function send(path, { method = 'GET', tok, body } = {}) {
  const headers = { accept: 'application/json' };
  if (tok) headers.authorization = `Bearer ${tok}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
}

const writes = () => queries.filter((q) => /^(update|delete) from|^update gateway|^update node/.test(q.sql));

describe('PATCH/DELETE /gateways/:id', () => {
  test('requires a session and the deploy capability', async () => {
    const student = token(2, 2);
    for (const method of ['PATCH', 'DELETE']) {
      const body = method === 'PATCH' ? { Gateway_Name: 'x' } : undefined;
      assert.equal((await send('/gateways/1', { method, body })).status, 401);
      assert.equal((await send('/gateways/1', { method, body, tok: student })).status, 403);
    }
    assert.equal(writes().length, 0);
  });

  test('MSS members, who can deploy nodes, can edit gateways too', async () => {
    const mss = token(3, 3);
    const response = await send('/gateways/1', { method: 'PATCH', tok: mss, body: { Gateway_Name: 'Shed' } });
    assert.equal(response.status, 200);
    assert.equal(response.json.Gateway_Name, 'Shed');
  });

  test('rejects bad ids and bad bodies before touching the database', async () => {
    const admin = token(1, 1);
    assert.equal((await send('/gateways/0', { method: 'PATCH', tok: admin, body: { Gateway_Name: 'x' } })).status, 422);
    assert.equal((await send('/gateways/1', { method: 'PATCH', tok: admin, body: {} })).status, 422);
    assert.equal((await send('/gateways/1', { method: 'PATCH', tok: admin, body: { Gateway_Code: 'has space' } })).status, 422);
    assert.equal((await send('/gateways/1', { method: 'PATCH', tok: admin, body: { Latitude: 43 } })).status, 422);
    assert.equal((await send('/gateways/1', { method: 'PATCH', tok: admin, body: { Latitude: 91, Longitude: 0 } })).status, 422);
    assert.equal((await send('/gateways/0', { method: 'DELETE', tok: admin })).status, 422);
    assert.equal(writes().length, 0);
  });

  test('admin edits name, code, notes, and location', async () => {
    const admin = token(1, 1);
    const response = await send('/gateways/1', {
      method: 'PATCH',
      tok: admin,
      body: { Gateway_Code: 'pi-2', Gateway_Name: ' Sugar shack ', Notes: 'Roof mount', Latitude: 43.1, Longitude: -77.6 },
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.Gateway_Code, 'pi-2');
    assert.equal(response.json.Gateway_Name, 'Sugar shack');
    assert.equal(response.json.Notes, 'Roof mount');
    assert.deepEqual(response.json.Location, { lat: 43.1, lon: -77.6 });
    assert.equal(response.json.Status, 'Online');
  });

  test('clears notes and location', async () => {
    const admin = token(1, 1);
    gateway = gatewayRow({ notes: 'old', latitude: 43, longitude: -77 });
    const response = await send('/gateways/1', {
      method: 'PATCH',
      tok: admin,
      body: { Notes: '', Latitude: null, Longitude: null },
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.Notes, null);
    assert.equal(response.json.Location, null);
  });

  test('a duplicate code is a validation error', async () => {
    const admin = token(1, 1);
    const response = await send('/gateways/1', { method: 'PATCH', tok: admin, body: { Gateway_Code: 'taken' } });
    assert.equal(response.status, 422);
  });

  test('an unknown gateway is a 404', async () => {
    const admin = token(1, 1);
    assert.equal((await send('/gateways/9', { method: 'PATCH', tok: admin, body: { Gateway_Name: 'x' } })).status, 404);
    assert.equal((await send('/gateways/9', { method: 'DELETE', tok: admin })).status, 404);
  });

  test('delete unassigns its nodes, then removes the gateway', async () => {
    const admin = token(1, 1);
    assert.equal((await send('/gateways/1', { method: 'DELETE', tok: admin })).status, 204);
    const sqls = queries.map((q) => q.sql);
    const detach = sqls.findIndex((s) => s.startsWith('update node set gateway_id = null'));
    const remove = sqls.findIndex((s) => s.startsWith('delete from gateway'));
    assert.ok(detach >= 0 && remove > detach, 'nodes are detached before the gateway is deleted');
    assert.ok(sqls.includes('COMMIT'));
  });
});
