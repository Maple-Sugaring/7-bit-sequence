import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';

import '../env.js';
import { closePool } from '../../src/db/pool.js';
import { mapAlert, mapGateway, mapMetric, mapNode, mapUser } from '../../src/repositories/mappers.js';
import { modelSapRows } from '../../src/services/historicWeather.js';

after(() => closePool());

describe('row mappers', () => {
  test('keeps the frontend field names and hides storage details', () => {
    const user = mapUser({
      id: 7,
      role_id: 2,
      first_name: null,
      last_name: null,
      email: 'sam@g.rit.edu',
      created_at: '2026-01-15',
      last_login: new Date('2026-03-01T12:00:00.000Z'),
      is_active: true,
      account_expiry: new Date('2026-05-01T00:00:00.000Z'),
      google_calendar_id: null,
      calendar_connected: 0,
      invite_pending: true,
    });

    assert.equal(user.UserID, 7);
    assert.equal(user.First_Name, '');
    assert.equal(user.Created_At, '2026-01-15');
    assert.equal(user.Last_Login, '2026-03-01T12:00:00.000Z');
    assert.equal(user.Calendar_Connected, false);
    assert.equal(Object.hasOwn(user, 'google_refresh_token'), false);
  });

  test('treats an unknown gateway status as offline', () => {
    assert.equal(mapGateway({ id: 1, gateway_code: 'gw', status: 'active' }).Status, 'Online');
    assert.equal(mapGateway({ id: 1, gateway_code: 'gw', status: 'degraded' }).Status, 'Offline');
    assert.equal(mapGateway({ id: 1, gateway_code: 'gw', status: null }).Status, 'Offline');
  });

  test('omits a location when either coordinate is missing', () => {
    const placed = mapNode({ id: 1, node_code: 'n1', latitude: '43.084', longitude: '-77.68', status_code: 1 });
    assert.deepEqual(placed.Location, { lat: 43.084, lon: -77.68 });

    const unplaced = mapNode({ id: 2, node_code: 'n2', latitude: null, longitude: -77.6, status_code: 1 });
    assert.equal(unplaced.Location, null);
  });

  test('parses numeric strings and renames the alert message', () => {
    const metric = mapMetric({
      id: 9,
      node_id: 1,
      weight: '12.50',
      temperature: null,
      sugar_percent: '2.10',
      ice_present: 0,
      recorded_at: new Date('2026-03-01T15:00:00.000Z'),
    });
    assert.equal(metric.Weight, 12.5);
    assert.equal(metric.Temperature, null);
    assert.equal(metric.Sugar_Percent, 2.1);
    assert.equal(metric.Ice_Present, false);

    assert.equal(mapAlert({ id: 3, node_id: 1, alert_type: 'Spoilage', message: 'Warm sap', is_resolved: false }).Description, 'Warm sap');
  });
});

describe('historic sap model', () => {
  test('scales flow by tree and keeps weight above the bucket tare', () => {
    const rows = modelSapRows(
      [
        {
          date: '2026-03-10',
          tempMinF: 20,
          tempMaxF: 45,
          precipIn: 0,
          conditions: 'Clear',
        },
      ],
      [{ id: 1, stand: 'Sugar Shack', tare_weight: 2 }],
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].nodeId, 1);
    assert.equal(rows[0].sapRun, true);
    assert.ok(rows[0].weightLb >= 2);
    assert.ok(rows[0].flowGal > 0);
    assert.ok(rows[0].flowGal < 2.6);
  });
});
