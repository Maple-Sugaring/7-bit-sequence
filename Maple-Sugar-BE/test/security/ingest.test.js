import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mock, after, before, describe, test } from 'node:test';

import '../env.js';
import { signAccessToken } from '../../src/auth/jwt.js';
import { config } from '../../src/config.js';
import { pool, closePool } from '../../src/db/pool.js';

/**
 * Stand-in for Postgres. The ingest handler's SQL is answered from this
 * fixture so the test can watch inserts, heartbeats, and retries without a
 * database.
 */
const state = {
  gateway: null,
  nodes: [],
  existing: null,
  created: [],
  heartbeats: [],
  touches: [],
  bucketId: 11,
  command: null,
  alertResolves: [],
  alertInserts: [],
};

function nodeRow(overrides) {
  return {
    id: 1,
    gateway_id: 1,
    node_code: 'NODE-001',
    lora_device_id: 'E8:9F:6D:11:A2:41',
    node_name: 'Alumni House - Tree 1',
    status_code: 1,
    battery_level: 90,
    signal_rssi: -70,
    latitude: 43.08,
    longitude: -77.67,
    stand: 'Alumni House',
    last_seen: '2026-03-01T12:00:00.000Z',
    report_interval_seconds: 900,
    tracked: true,
    ...overrides,
  };
}

function reset() {
  state.gateway = { id: 1, gateway_code: 'GW-ALUMNI' };
  state.nodes = [
    nodeRow(),
    nodeRow({
      id: 9,
      gateway_id: 2,
      node_code: 'NODE-009',
      lora_device_id: 'E8:9F:6D:19:A2:49',
      node_name: 'Chabad House - Tree 3',
    }),
  ];
  state.existing = null;
  state.created = [];
  state.heartbeats = [];
  state.touches = [];
  state.bucketId = 11;
  state.command = null;
  state.alertResolves = [];
  state.alertInserts = [];
}

mock.method(pool, 'query', async (text, params = []) => {
  const sql = String(text);

  if (sql.includes('from calibration_commands')) {
    const open = state.command && ['pending', 'sent'].includes(state.command.status);
    return open ? { rows: [state.command], rowCount: 1 } : { rows: [], rowCount: 0 };
  }

  if (sql.includes('update calibration_commands')) {
    if (!state.command) return { rows: [], rowCount: 0 };
    if (sql.includes("status = 'sent'")) state.command.status = 'sent';
    else {
      state.command.status = params[1];
      state.command.counts_per_lb = params[2];
    }
    return { rows: [state.command], rowCount: 1 };
  }

  if (sql.includes('update alerts')) {
    state.alertResolves.push({ nodeId: params[0], types: params[1] });
    return { rows: [], rowCount: params[1]?.length ?? 0 };
  }

  if (sql.includes('insert into alerts')) {
    const row = { id: 70 + state.alertInserts.length, node_id: params[0], alert_type: params[1], severity: params[2] };
    state.alertInserts.push(row);
    return { rows: [row], rowCount: 1 };
  }

  if (sql.includes('from gateway')) {
    if (!state.gateway) return { rows: [], rowCount: 0 };
    if (state.gateway.gateway_code.toUpperCase() !== String(params[0]).toUpperCase()) {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [state.gateway], rowCount: 1 };
  }

  if (sql.includes('update gateway')) {
    state.touches.push({ id: params[0], ipAddress: params[1] });
    return { rows: [], rowCount: 1 };
  }

  if (sql.includes('where node_code')) {
    const row = state.nodes.find((node) => node.node_code === params[0]);
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }

  if (sql.includes('where lora_device_id')) {
    const row = state.nodes.find((node) => node.lora_device_id === params[0]);
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }

  if (sql.includes('from node where id')) {
    const row = state.nodes.find((node) => node.id === Number(params[0]));
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }

  if (sql.includes('update node')) {
    state.heartbeats.push({ id: params[0], battery: params[1], rssi: params[2] });
    return { rows: [], rowCount: 1 };
  }

  if (sql.includes('tare_weight')) {
    return { rows: [], rowCount: 0 };
  }

  if (sql.includes('from buckets')) {
    return state.bucketId == null
      ? { rows: [], rowCount: 0 }
      : { rows: [{ id: state.bucketId }], rowCount: 1 };
  }

  if (sql.includes('recorded_at = $2')) {
    if (!state.existing) return { rows: [], rowCount: 0 };
    if (state.existing.node_id !== params[0] || state.existing.recorded_at !== params[1]) {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [state.existing], rowCount: 1 };
  }

  if (sql.includes('insert into metrics')) {
    const row = {
      id: 50 + state.created.length,
      node_id: params[0],
      bucket_id: params[1],
      recorded_by_user_id: params[2],
      recorded_at: params[3],
      weight: params[4],
      temperature: params[5],
      sugar_percent: params[6],
      weather_conditions: params[7],
      ice_present: params[8],
    };
    state.created.push(row);
    return { rows: [row], rowCount: 1 };
  }

  if (sql.includes('from metrics')) {
    return { rows: [], rowCount: 0 };
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

const reading = {
  Node_Code: 'NODE-001',
  Recorded_At: '2026-03-02T14:00:00.000Z',
  Weight: 14.2,
  Temperature: 36.5,
  Battery_Percent: 88,
  Signal_Rssi: -74,
};

const sample = { Gateway_Code: 'GW-ALUMNI', ...reading };

async function send(body, { token = 'test-gateway-token', header = 'x-gateway-token' } = {}) {
  const headers = { accept: 'application/json', 'content-type': 'application/json' };
  if (token != null && header === 'x-gateway-token') headers['x-gateway-token'] = token;
  if (token != null && header === 'bearer') headers.authorization = `Bearer ${token}`;
  if (token != null && header === 'gateway') headers.authorization = `Gateway ${token}`;

  const response = await fetch(`${baseUrl}/ingest`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
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
  return { status: response.status, json };
}

describe('POST /ingest', () => {
  test('rejects a missing, wrong, or user token', async () => {
    reset();
    const missing = await send(sample, { token: null });
    assert.equal(missing.status, 401);
    assert.equal(missing.json.code, 'BAD_CREDENTIALS');

    const wrong = await send(sample, { token: 'not-the-gateway-token' });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.json.code, 'BAD_CREDENTIALS');

    const userToken = signAccessToken({ UserID: 1, Email: 'ada@rit.edu', RoleID: 1 });
    const session = await send(sample, { token: userToken, header: 'bearer' });
    assert.equal(session.status, 401);
    assert.equal(state.created.length, 0);
    assert.equal(state.touches.length, 0);
  });

  test('accepts the token as a bearer or gateway scheme', async () => {
    reset();
    const bearer = await send(sample, { header: 'bearer' });
    assert.equal(bearer.status, 201);

    reset();
    const gateway = await send(
      { ...sample, Recorded_At: '2026-03-02T14:05:00.000Z' },
      { header: 'gateway' },
    );
    assert.equal(gateway.status, 201);
  });

  test('stays closed when the ingest token is not configured', async () => {
    reset();
    const previous = config.gatewayIngestToken;
    config.gatewayIngestToken = '';
    try {
      const response = await send(sample);
      assert.equal(response.status, 503);
      assert.equal(response.json.code, 'UNAVAILABLE');
      assert.equal(state.created.length, 0);
    } finally {
      config.gatewayIngestToken = previous;
    }
  });

  test('rejects an unknown gateway before writing', async () => {
    reset();
    state.gateway = null;
    const response = await send(sample);
    assert.equal(response.status, 404);
    assert.equal(response.json.code, 'NOT_FOUND');
    assert.equal(state.created.length, 0);
    assert.equal(state.touches.length, 0);
  });

  test('stores a reading with no user and marks the hardware heard', async () => {
    reset();
    const response = await send(sample);
    assert.equal(response.status, 201);
    assert.equal(response.json.Gateway_Code, 'GW-ALUMNI');
    assert.equal(response.json.Accepted.length, 1);
    assert.equal(response.json.Accepted[0].Duplicate, false);
    assert.equal(response.json.Accepted[0].Reading.Recorded_By_UserID, null);
    assert.equal(response.json.Accepted[0].Reading.Weight, 14.2);
    assert.equal(response.json.Accepted[0].Reading.Temperature, null);
    assert.equal(response.json.Accepted[0].Reading.BucketID, 11);
    assert.equal(state.created.length, 1);
    assert.equal(state.created[0].recorded_by_user_id, null);
    assert.equal(state.created[0].temperature, null);
    assert.equal(state.heartbeats.length, 1);
    assert.equal(state.heartbeats[0].id, 1);
    assert.equal(state.heartbeats[0].battery, 88);
    assert.equal(state.heartbeats[0].rssi, -74);
    assert.equal(state.touches.length, 1);
    assert.equal(state.touches[0].id, 1);
  });

  test('treats the same node and timestamp as a retry', async () => {
    reset();
    state.existing = {
      id: 8,
      node_id: 1,
      bucket_id: 11,
      recorded_by_user_id: null,
      recorded_at: reading.Recorded_At,
      weight: 14.2,
      temperature: 36.5,
      sugar_percent: null,
      weather_conditions: null,
      ice_present: false,
    };

    const response = await send(sample);
    assert.equal(response.status, 200);
    assert.equal(response.json.Accepted[0].Duplicate, true);
    assert.equal(response.json.Accepted[0].Reading.MetricID, 8);
    assert.equal(state.created.length, 0);
    assert.equal(state.heartbeats.length, 1);
  });

  test('keeps the good readings when another node in the batch fails', async () => {
    reset();
    const response = await send({
      Gateway_Code: 'gw-alumni',
      Readings: [
        reading,
        {
          Node_Code: 'NODE-404',
          Recorded_At: '2026-03-02T14:00:00.000Z',
          Weight: 10,
        },
        {
          Node_Code: 'NODE-009',
          Recorded_At: '2026-03-02T14:00:00.000Z',
          Weight: 10,
        },
      ],
    });

    assert.equal(response.status, 201);
    assert.equal(response.json.Gateway_Code, 'GW-ALUMNI');
    assert.equal(response.json.Accepted.length, 1);
    assert.equal(response.json.Accepted[0].Reading.NodeID, 1);
    assert.equal(response.json.Rejected.length, 2);
    assert.equal(response.json.Rejected[0].code, 'NOT_FOUND');
    assert.equal(response.json.Rejected[1].code, 'FORBIDDEN');
    assert.equal(state.created.length, 1);
  });

  test('stores nothing when the only reading is too heavy for a liquid bucket', async () => {
    reset();
    const response = await send({
      Gateway_Code: 'GW-ALUMNI',
      Readings: [
        {
          LoRa_Device_ID: 'E8:9F:6D:11:A2:41',
          Recorded_At: '2026-03-02T15:00:00.000Z',
          Weight: 200,
        },
      ],
    });

    assert.equal(response.status, 422);
    assert.equal(response.json.code, 'VALIDATION');
    assert.equal(response.json.details.Rejected.length, 1);
    assert.match(response.json.details.Rejected[0].message, /10 gallons/);
    assert.equal(state.created.length, 0);
    assert.equal(state.heartbeats.length, 0);
    assert.equal(state.touches.length, 1);
  });

  test('hands a waiting calibration to the Pi and marks it sent', async () => {
    reset();
    state.command = { id: 31, node_id: 1, action: 'calibrate', pounds: '10.000', status: 'pending' };
    const response = await send(sample);
    assert.equal(response.status, 201);
    assert.deepEqual(response.json.Accepted[0].Command, { Command_Id: 31, Action: 'CAL', Pounds: 10 });
    assert.equal(response.json.Accepted[0].Desired_Interval_Seconds, 900);
    assert.equal(state.command.status, 'sent');
  });

  test('settles the command when the node echoes its id, and stops sending it', async () => {
    reset();
    state.command = { id: 31, node_id: 1, action: 'calibrate', pounds: '10.000', status: 'sent' };
    const response = await send({ ...sample, Command_Id: 31, Command_Ok: 1, Counts_Per_Lb: 10246 });
    assert.equal(response.status, 201);
    assert.equal(response.json.Accepted[0].Command, undefined);
    assert.equal(state.command.status, 'done');
    assert.equal(state.command.counts_per_lb, 10246);
  });

  test('still delivers a tare to a node that is reporting a fault', async () => {
    reset();
    state.command = { id: 32, node_id: 1, action: 'tare', pounds: null, status: 'pending' };
    const response = await send({
      Gateway_Code: 'GW-ALUMNI',
      Node_Code: 'NODE-001',
      Recorded_At: '2026-03-02T14:10:00.000Z',
      Fault: 'reversed',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.json.Accepted[0].Command, { Command_Id: 32, Action: 'TARE' });
  });

  test("a fault resolves the node's other fault alerts and raises its own", async () => {
    reset();
    const response = await send({
      Gateway_Code: 'GW-ALUMNI',
      Node_Code: 'NODE-001',
      Recorded_At: '2026-03-02T14:20:00.000Z',
      Fault: 'load-cell',
      Battery_Percent: 88,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(state.alertResolves, [
      { nodeId: 1, types: ['Unstable Reading', 'Reversed Load Cell', 'Untared'] },
    ]);
    assert.deepEqual(
      state.alertInserts.map((row) => row.alert_type),
      ['Load Cell'],
    );
  });

  test('rejects a body that names no node', async () => {
    reset();
    const response = await send({
      Gateway_Code: 'GW-ALUMNI',
      Recorded_At: '2026-03-02T14:00:00.000Z',
      Weight: 14.2,
    });
    assert.equal(response.status, 422);
    assert.equal(response.json.code, 'VALIDATION');
    assert.equal(state.touches.length, 0);
  });
});
