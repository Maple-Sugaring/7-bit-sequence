import { describe, expect, test } from 'vitest';

import { loadDrafts, loadSelectedTree, saveDrafts, saveSelectedTree } from '../src/data/draftStore';

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

describe('the selected tree', () => {
  test('comes back after a reload, and null forgets it', () => {
    const storage = memoryStorage();
    expect(loadSelectedTree(storage)).toBeNull();
    saveSelectedTree(7, storage);
    expect(loadSelectedTree(storage)).toBe(7);
    saveSelectedTree(null, storage);
    expect(loadSelectedTree(storage)).toBeNull();
  });

  test('a pick from a previous day is dropped, and junk is ignored', () => {
    const storage = memoryStorage();
    saveSelectedTree(7, storage, Date.now() - 13 * 3_600_000);
    expect(loadSelectedTree(storage)).toBeNull();
    storage.setItem('maple-collection-selected-tree', 'not json');
    expect(loadSelectedTree(storage)).toBeNull();
  });
});
