import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mock, after, before, beforeEach, describe, test } from 'node:test';

import '../env.js';
import { signAccessToken } from '../../src/auth/jwt.js';
import { pool, closePool } from '../../src/db/pool.js';


const users = new Map();
let statements;
let lockAvailable;



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




async function answer(text, params = []) {
  const sql = String(text);
  statements.push(sql);
  if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [], rowCount: 0 };
  if (sql.includes('from users')) {
    const row = users.get(Number(params[0]));
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }
  if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: lockAvailable }], rowCount: 1 };
  if (sql.includes('insert into metric_retention_runs')) return { rows: [{ id: 41 }], rowCount: 1 };
  if (sql.includes('as rows_eligible')) return { rows: [{ rows_eligible: 12, periods: 3 }], rowCount: 1 };
  if (sql.includes('as raw_rows')) {
    return {
      rows: [{
        raw_rows: 100, manual_rows: 4, corrected_rows: 1, eligible_rows: 0, oldest_raw: null,
        aggregate_rows: 10, compacted_readings: 600, oldest_aggregate: null, newest_aggregate: null,
        raw_bytes: 10000, aggregate_bytes: 2000,
      }],
      rowCount: 1,
    };
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
  statements = [];
  lockAvailable = true;
});

function token(id, role_id) {
  users.set(id, userRow(id, role_id));
  return signAccessToken({ UserID: id, Email: `u${id}@rit.edu`, RoleID: role_id });
}

const ADMIN = () => token(1, 1);
const STUDENT = () => token(5, 2);
const MSS = () => token(8, 3);

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

const ranJob = () => statements.some((sql) => sql.includes('pg_try_advisory_lock'));



describe('GET /metrics/retention', () => {
  test('is admin only', async () => {
    assert.equal((await send('/metrics/retention')).status, 401);
    assert.equal((await send('/metrics/retention', { tok: STUDENT() })).status, 403);
    assert.equal((await send('/metrics/retention', { tok: MSS() })).status, 403);
  });

  test('reports policy, storage use and the estimated saving', async () => {
    const response = await send('/metrics/retention', { tok: ADMIN() });
    assert.equal(response.status, 200);
    assert.equal(response.json.Policy.Raw_Retention_Days, 400);
    assert.equal(response.json.Policy.Period_Seconds, 3600);
    assert.equal(response.json.Raw.Rows, 100);
    assert.equal(response.json.Aggregates.Readings_Represented, 600);
    assert.equal(response.json.Compression_Ratio, 60);
    assert.equal(response.json.Estimated_Bytes_Saved, 58000);
  });
});

describe('POST /metrics/retention/run', () => {
  test('students and MSS cannot start the job', async () => {
    for (const tok of [STUDENT(), MSS()]) {
      const response = await send('/metrics/retention/run', { method: 'POST', tok, body: {} });
      assert.equal(response.status, 403);
    }
    assert.equal(ranJob(), false);
  });

  test('a dry run reports eligible rows and deletes nothing', async () => {
    const response = await send('/metrics/retention/run', { method: 'POST', tok: ADMIN(), body: { dryRun: true } });
    assert.equal(response.status, 200);
    assert.equal(response.json.Dry_Run, true);
    assert.equal(response.json.Rows_Eligible, 12);
    assert.equal(statements.some((sql) => sql.includes('delete from metrics')), false);
    const run = statements.find((sql) => sql.includes('insert into metric_retention_runs'));
    assert.ok(run, 'the run is recorded');
  });

  test('is a 409 while another run holds the lock', async () => {
    lockAvailable = false;
    const response = await send('/metrics/retention/run', { method: 'POST', tok: ADMIN() });
    assert.equal(response.status, 409);
    assert.equal(response.json.code, 'RETENTION_BUSY');
  });

  test('rejects a malformed body', async () => {
    const response = await send('/metrics/retention/run', { method: 'POST', tok: ADMIN(), body: { dryRun: 'yes' } });
    assert.equal(response.status, 422);
    assert.equal(ranJob(), false);
  });
});



describe('GET /metrics/rollup', () => {
  test('is open to anyone who can see the data table', async () => {
    assert.equal((await send('/metrics/rollup', { tok: MSS() })).status, 200);
    assert.equal((await send('/metrics/rollup', { tok: STUDENT() })).status, 200);
    assert.equal((await send('/metrics/rollup')).status, 401);
  });

  test('rejects an unknown interval or time zone before querying', async () => {
    const tok = STUDENT();
    statements = [];
    assert.equal((await send('/metrics/rollup?interval=minute', { tok })).status, 422);
    const zone = await send(`/metrics/rollup?timeZone=${encodeURIComponent("UTC'; drop table metrics; --")}`, { tok });
    assert.equal(zone.status, 422);
    assert.equal(statements.some((sql) => sql.includes('metric_aggregates')), false);
  });

  test('passes interval and zone as bound parameters, never interpolated', async () => {
    await send('/metrics/rollup?interval=week&timeZone=America/Chicago', { tok: STUDENT() });
    const sql = statements.find((text) => text.includes('date_trunc'));
    assert.ok(sql);
    assert.doesNotMatch(sql, /America\/Chicago|'week'/);
  });
});
