import { beforeAll, describe, expect, test } from 'vitest';

import { LB_PER_GALLON } from '../src/business/yieldMetrics';
import { request } from '../src/data/transports/mockTransport';

/**
 * EIR-001 / FR-003 / FR-019 prototyped on the mock API, so the workflow can be
 * tried in the browser before the backend gets the same rules. Each test
 * mirrors a line of the issue's acceptance criteria.
 */

const ADMIN = 'tpalmer@rit.edu';
const STUDENT = 'mo5521@g.rit.edu';

const login = (email) => request({ method: 'POST', path: '/auth/login', body: { email, password: 'pw' } });
const get = (path, query) => request({ method: 'GET', path, query });
const post = (path, body) => request({ method: 'POST', path, body });
const patch = (path, body) => request({ method: 'PATCH', path, body });

const openAlerts = async (nodeId, type) =>
  (await get('/alerts', { resolved: 'false' })).filter((alert) => alert.NodeID === nodeId && alert.Alert_Type === type);

describe('warning flows in the mock API', () => {
  beforeAll(async () => {
    await login(ADMIN);
  });

  test('rejects an out-of-range reading with a message per field and stores nothing', async () => {
    const before = (await get('/metrics', { nodeId: 5 })).length;
    await expect(post('/metrics', { NodeID: 5, Sugar_Percent: 40, Temperature: 200 })).rejects.toMatchObject({
      status: 422,
      details: { Sugar_Percent: expect.stringMatching(/between/), Temperature: expect.stringMatching(/between/) },
    });
    expect((await get('/metrics', { nodeId: 5 })).length).toBe(before);
  });

  test('a filling bucket warns at 75%, then full replaces it, then collecting clears both', async () => {
    const tare = (await get('/buckets')).find((bucket) => bucket.NodeID === 5).Tare_Weight;

    await post('/metrics', { NodeID: 5, Weight: tare + 7.9 * LB_PER_GALLON });
    const [collect] = await openAlerts(5, 'Collection Needed');
    expect(collect.Description).toMatch(/7\.9 gal.*79%/);
    expect(await openAlerts(5, 'Full Bucket')).toHaveLength(0);

    // A second heavy reading does not stack a duplicate warning.
    await post('/metrics', { NodeID: 5, Weight: tare + 8.2 * LB_PER_GALLON });
    expect(await openAlerts(5, 'Collection Needed')).toHaveLength(1);

    await post('/metrics', { NodeID: 5, Weight: tare + 9.8 * LB_PER_GALLON });
    expect(await openAlerts(5, 'Full Bucket')).toHaveLength(1);
    expect(await openAlerts(5, 'Collection Needed')).toHaveLength(0);

    await post('/nodes/5/actions', { Action: 'collect' });
    expect(await openAlerts(5, 'Full Bucket')).toHaveLength(0);
  });

  test('the offline node in the sample data says its bucket may be full', async () => {
    const [offline] = await openAlerts(11, 'Node Offline');
    expect(offline.Description).toMatch(/possibly full/);
  });

  test('admin actions land in the audit history with who did them', async () => {
    const [alert] = await openAlerts(8, 'Low Battery');
    await patch(`/alerts/${alert.AlertID}`, { Is_Resolved: true });
    await post('/nodes/4/calibration', { Action: 'tare' });
    await request({ method: 'DELETE', path: '/nodes/4/calibration' });

    const { items } = await get('/audit-events');
    expect(items.slice(0, 3).map((event) => event.event_type)).toEqual([
      'calibration_cancelled',
      'node_tare',
      'alert_resolved',
    ]);
    expect(items[2]).toMatchObject({ actor_name: 'Tom Palmer', target_id: alert.AlertID });
    expect(items[2].note).toMatch(/Low Battery/);
  });

  test('only administrators can read the audit history', async () => {
    await login(STUDENT);
    await expect(get('/audit-events')).rejects.toMatchObject({ status: 403 });
    await login(ADMIN);
  });
});
