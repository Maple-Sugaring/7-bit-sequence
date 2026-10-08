import { beforeAll, describe, expect, test } from 'vitest';

import { request } from '../src/data/transports/mockTransport';

/**
 * The mock API stands in for Express in development and for mock logins. It has
 * to behave like POST /collections, or a page that works against it would break
 * against the real thing. These run the whole flow through it.
 */

const STUDENT = 'mo5521@g.rit.edu';
const MSS = 'sd9014@g.rit.edu';

const login = (email) => request({ method: 'POST', path: '/auth/login', body: { email, password: 'pw' } });
const get = (path, query) => request({ method: 'GET', path, query });
const post = (path, body) => request({ method: 'POST', path, body });

const hourAgo = () => new Date(Date.now() - 3_600_000).toISOString();
const ref = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('POST /collections in the mock API', () => {
  beforeAll(async () => {
    await login(STUDENT);
  });

  test('one save files the reading, the collection log, and the journal entry', async () => {
    const before = {
      metrics: (await get('/metrics', { nodeId: 2 })).length,
      logs: (await get('/collection-logs')).length,
      journal: (await get('/journal')).length,
    };

    const saved = await post('/collections', {
      NodeID: 2,
      Weight: 40,
      Sugar_Percent: null,
      Ice_Present: false,
      Collected_At: hourAgo(),
      Notes: 'Lid was frozen.',
      Round_Label: 'Morning round',
      Client_Ref: ref(1),
    });

    expect(saved.Duplicate).toBe(false);
    expect(saved.Entry.Title).toMatch(/^Collected /);
    expect(saved.Entry.Round_Label).toBe('Morning round');
    expect(saved.Entry.Sugar_Percent).toBeNull();
    expect(saved.Log.Volume_Collected).toBeGreaterThan(4);
    expect(saved.Log.Volume_Collected).toBeLessThan(5);

    expect(await get('/metrics', { nodeId: 2 })).toHaveLength(before.metrics + 1);
    expect(await get('/collection-logs')).toHaveLength(before.logs + 1);
    const journal = await get('/journal');
    expect(journal).toHaveLength(before.journal + 1);
    expect(journal[0].EntryID).toBe(saved.Entry.EntryID);
  });

  test('a repeated upload returns the first entry and files nothing new', async () => {
    const body = { NodeID: 2, Weight: 25, Collected_At: hourAgo(), Client_Ref: ref(2) };
    const first = await post('/collections', body);
    const logs = (await get('/collection-logs')).length;

    const retry = await post('/collections', body);
    expect(retry.Duplicate).toBe(true);
    expect(retry.Entry.EntryID).toBe(first.Entry.EntryID);
    expect(await get('/collection-logs')).toHaveLength(logs);
  });

  test("a tree's sugar is the last test, and a newer sensor reading does not erase it", async () => {
    const tested = new Date().toISOString();
    await post('/collections', {
      NodeID: 2,
      Weight: 30,
      Sugar_Percent: 2.4,
      Collected_At: tested,
      Client_Ref: ref(3),
    });

    // The sensor reports again afterward, with no sugar on the row.
    await post('/metrics', { NodeID: 2, Weight: 9.5, Recorded_At: new Date(Date.now() + 30_000).toISOString() });

    const after = (await get('/nodes/board')).find((row) => row.NodeID === 2);
    expect(after.Weight).toBe(9.5);
    expect(after.Sugar_Percent).toBe(2.4);
    expect(after.Sugar_Measured_At).toBe(tested);
  });

  test('closes the full-bucket alert for the tree that was emptied', async () => {
    const open = async () =>
      (await get('/alerts', { resolved: 'false' })).filter((alert) => alert.NodeID === 3 && alert.Alert_Type === 'Full Bucket');
    expect(await open()).not.toHaveLength(0);

    await post('/collections', { NodeID: 3, Weight: 30, Collected_At: hourAgo(), Client_Ref: ref(4) });

    expect(await open()).toHaveLength(0);
  });

  test('refuses a collection with no weight, with the message for that field', async () => {
    await expect(post('/collections', { NodeID: 2, Sugar_Percent: 2.1 })).rejects.toMatchObject({
      status: 422,
      details: { Weight: 'Enter the sap weight.' },
    });
  });

  test('refuses a tree that does not exist', async () => {
    await expect(post('/collections', { NodeID: 9999, Weight: 20 })).rejects.toMatchObject({ status: 404 });
  });

  test('is closed to a role that cannot record data', async () => {
    await login(MSS);
    await expect(post('/collections', { NodeID: 2, Weight: 20 })).rejects.toMatchObject({ status: 403 });
    await login(STUDENT);
  });
});
