import { describe, expect, test } from 'vitest';

import { loadDrafts, saveDrafts } from '../src/data/draftStore';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}

describe('collection drafts', () => {
  test('what was typed for a tree comes back after a reload', () => {
    const storage = memoryStorage();
    saveDrafts({ 3: { weight: '4.2', savedAt: Date.now() } }, storage);
    expect(loadDrafts(storage)[3].weight).toBe('4.2');
  });

  test('drafts from a previous day are dropped', () => {
    const storage = memoryStorage();
    saveDrafts({ 3: { weight: '4.2', savedAt: Date.now() - 13 * 3_600_000 } }, storage);
    expect(loadDrafts(storage)).toEqual({});
  });
});
