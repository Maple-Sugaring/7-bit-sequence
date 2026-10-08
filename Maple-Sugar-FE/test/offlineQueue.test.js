import { describe, expect, test } from 'vitest';

import { enqueueCollection, flushCollectionQueue, queuedCollections, rejectedCollections } from '../src/data/offlineQueue';

function memory() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

describe('collection offline queue', () => {
  test('keeps an entry when the network is down and uploads it once send succeeds', async () => {
    const store = memory();
    enqueueCollection({ Title: 'North line' }, store);
    expect(queuedCollections(store)).toHaveLength(1);

    const blocked = await flushCollectionQueue(async () => {
      const error = new Error('offline');
      error.code = 'NETWORK';
      error.isOffline = true;
      throw error;
    }, store);
    expect(blocked).toEqual({ flushed: 0, remaining: 1, rejected: [] });

    const sent = [];
    const replayed = await flushCollectionQueue(async (entry) => {
      sent.push(entry);
    }, store);
    expect(sent).toEqual([{ Title: 'North line' }]);
    expect(replayed).toEqual({ flushed: 1, remaining: 0, rejected: [] });
    expect(queuedCollections(store)).toHaveLength(0);
  });

  test('sets aside an entry the server refuses, instead of keeping it forever', async () => {
    const store = memory();
    enqueueCollection({ NodeID: 1, Sugar_Percent: 2.1 }, store);
    enqueueCollection({ NodeID: 2, Weight: 20 }, store);

    const sent = [];
    const result = await flushCollectionQueue(async (entry) => {
      if (entry.NodeID === 1) {
        const error = new Error('Enter the sap weight.');
        error.status = 422;
        throw error;
      }
      sent.push(entry);
    }, store);

    expect(sent).toEqual([{ NodeID: 2, Weight: 20 }]);
    expect(result.flushed).toBe(1);
    expect(result.remaining).toBe(0);
    expect(result.rejected).toEqual([{ entry: { NodeID: 1, Sugar_Percent: 2.1 }, message: 'Enter the sap weight.' }]);
    expect(queuedCollections(store)).toHaveLength(0);
    expect(rejectedCollections(store)).toEqual(result.rejected);

    const again = await flushCollectionQueue(async () => {
      throw new Error('Rejected entries must not retry automatically.');
    }, store);
    expect(again.rejected).toEqual(result.rejected);
  });

  test('keeps an entry through a server error that a retry could fix', async () => {
    const store = memory();
    enqueueCollection({ NodeID: 1, Weight: 20 }, store);

    const error = new Error('Bad gateway');
    error.status = 502;
    const result = await flushCollectionQueue(async () => {
      throw error;
    }, store);

    expect(result).toEqual({ flushed: 0, remaining: 1, rejected: [] });
  });
});
