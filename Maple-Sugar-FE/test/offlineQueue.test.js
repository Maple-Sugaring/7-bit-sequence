import { describe, expect, test } from 'vitest';

import { enqueueCollection, flushCollectionQueue, queuedCollections } from '../src/data/offlineQueue';

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
    expect(blocked).toEqual({ flushed: 0, remaining: 1 });

    const sent = [];
    const replayed = await flushCollectionQueue(async (entry) => {
      sent.push(entry);
    }, store);
    expect(sent).toEqual([{ Title: 'North line' }]);
    expect(replayed).toEqual({ flushed: 1, remaining: 0 });
    expect(queuedCollections(store)).toHaveLength(0);
  });
});
