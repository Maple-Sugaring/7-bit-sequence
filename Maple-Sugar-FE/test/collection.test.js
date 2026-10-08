import { describe, expect, test } from 'vitest';

import {
  ROUND_MAX_AGE_HOURS,
  SENSOR_FRESH_MINUTES,
  addToRound,
  isRoundExpired,
  nextTreeToLog,
  sapGallonsFor,
  sensorDefaults,
  startRound,
  summarizeRound,
} from '../src/business/collectionRound';
import {
  DEFAULT_SAP_TO_SYRUP,
  SugarBasis,
  basisLabel,
  bushAverageSugar,
  sugarForEstimate,
  syrupEstimate,
} from '../src/business/sugarContent';
import { validateCollectionEntry, validateReading } from '../src/business/validation';
import { newClientRef } from '../src/data/clientRef';
import { loadRound, saveRound } from '../src/data/roundStore';
import { toRequest } from '../src/services/collectionService';

function memory() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

describe('estimating syrup when sugar is optional', () => {
  test('the untested default is the sponsor yield of 43:1, which is the rule of 86 at 2.0%', () => {
    expect(DEFAULT_SAP_TO_SYRUP).toBe(43);
    const untested = syrupEstimate({ sapGallons: 43 });
    expect(untested.syrupGallons).toBeCloseTo(1, 5);
    expect(untested.basis).toBe(SugarBasis.DEFAULT);
    expect(untested.percent).toBeNull();
    expect(syrupEstimate({ sapGallons: 43, tested: 2 }).syrupGallons).toBeCloseTo(untested.syrupGallons, 5);
  });

  test('leans on this collection, then this tree, then the bush, then the default', () => {
    expect(sugarForEstimate({ tested: '2.4', tree: 2.0, bush: 2.2 })).toEqual({ percent: 2.4, basis: 'tested' });
    expect(sugarForEstimate({ tree: 2.0, bush: 2.2 })).toEqual({ percent: 2.0, basis: 'tree' });
    expect(sugarForEstimate({ bush: 2.2 })).toEqual({ percent: 2.2, basis: 'bush' });
    expect(sugarForEstimate({})).toEqual({ percent: null, basis: 'default' });
  });

  test('a blank, zero, or junk sugar value is not a test', () => {
    for (const value of ['', null, undefined, 0, 'abc']) {
      expect(sugarForEstimate({ tested: value }).basis).toBe('default');
    }
  });

  test('a sweeter tree makes more syrup from the same sap', () => {
    const sweet = syrupEstimate({ sapGallons: 10, tested: 3 });
    const thin = syrupEstimate({ sapGallons: 10, tested: 1.5 });
    expect(sweet.syrupGallons).toBeGreaterThan(thin.syrupGallons);
    expect(sweet.ratio).toBeCloseTo(86 / 3, 5);
  });

  test('averages only the trees that were tested', () => {
    expect(bushAverageSugar([{ Sugar_Percent: 2 }, { Sugar_Percent: null }, { Sugar_Percent: 3 }, {}])).toBe(2.5);
    expect(bushAverageSugar([{ Sugar_Percent: null }])).toBeNull();
    expect(bushAverageSugar(undefined)).toBeNull();
  });

  test('flags a tested reading on an iced bucket as running high, and only that', () => {
    expect(syrupEstimate({ sapGallons: 5, tested: 4, ice: true }).approximate).toBe(true);
    expect(syrupEstimate({ sapGallons: 5, tested: 4, ice: false }).approximate).toBe(false);
    expect(syrupEstimate({ sapGallons: 5, tree: 2, ice: true }).approximate).toBe(false);
  });

  test('has no estimate without a sap volume', () => {
    expect(syrupEstimate({ sapGallons: null })).toBeNull();
    expect(syrupEstimate({ sapGallons: -1 })).toBeNull();
    expect(syrupEstimate({ sapGallons: 0 }).syrupGallons).toBe(0);
  });

  test('says in words what an estimate used', () => {
    expect(basisLabel(syrupEstimate({ sapGallons: 4, tested: 2.34 }))).toBe('your 2.3% test');
    expect(basisLabel(syrupEstimate({ sapGallons: 4, tree: 2 }))).toMatch(/this tree's last test, 2.0%/);
    expect(basisLabel(syrupEstimate({ sapGallons: 4, bush: 2.1 }))).toMatch(/average of trees tested/);
    expect(basisLabel(syrupEstimate({ sapGallons: 4 }))).toMatch(/^43:1/);
  });

  test('sap volume comes off the net weight, not the gross', () => {
    expect(sapGallonsFor(2.5 + 8.34 * 5, 2.5)).toBeCloseTo(5, 5);
    expect(sapGallonsFor(2, 2.5)).toBe(0);
    expect(sapGallonsFor('', 2.5)).toBeNull();
    expect(sapGallonsFor(null)).toBeNull();
  });
});

describe('validating a collection', () => {
  const base = { NodeID: 1, Weight: 30, Ice_Present: false };

  test('needs only a weight', () => {
    expect(validateCollectionEntry(base).isValid).toBe(true);
    expect(validateCollectionEntry({ ...base, Sugar_Percent: '' }).isValid).toBe(true);
  });

  test('sugar without a weight is not enough', () => {
    const result = validateCollectionEntry({ NodeID: 1, Sugar_Percent: 2.1 });
    expect(result.isValid).toBe(false);
    expect(result.errors.Weight).toBe('Enter the sap weight.');
    expect(validateCollectionEntry({ NodeID: 1 }).errors.Sugar_Percent).toBeUndefined();
  });

  test('rejects a weight that is not above the empty bucket', () => {
    const result = validateCollectionEntry({ ...base, Weight: 2 }, { tareWeight: 2.5 });
    expect(result.errors.Weight).toMatch(/empty bucket \(2.5 lb\)/);
  });

  test('rejects an implausible sugar reading and warns on an unusual one', () => {
    expect(validateCollectionEntry({ ...base, Sugar_Percent: 40 }).errors.Sugar_Percent).toMatch(/between/);
    expect(validateCollectionEntry({ ...base, Sugar_Percent: 5 }).warnings.Sugar_Percent).toMatch(/typical/);
  });

  test('a sweet reading from an iced bucket is expected, not suspicious', () => {
    const icy = { Sugar_Percent: 8, Weight: 60, NodeID: 1, Recorded_At: new Date().toISOString() };
    expect(validateReading({ ...icy, Ice_Present: false }).warnings.Sugar_Percent).toMatch(/typical/);
    expect(validateReading({ ...icy, Ice_Present: true }).warnings.Sugar_Percent).toBeUndefined();
    expect(validateReading({ ...icy, Sugar_Percent: 11, Ice_Present: true }).warnings.Sugar_Percent).toMatch(/1.5-10%/);
  });

  test('a blank time means now, and a future time is refused', () => {
    expect(validateCollectionEntry(base).errors.Recorded_At).toBeUndefined();
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(validateCollectionEntry({ ...base, Recorded_At: future }).errors.Recorded_At).toMatch(/future/);
  });
});

describe('a collection round', () => {
  const trees = [
    { nodeId: 1, label: 'Alumni - Tree 1' },
    { nodeId: 2, label: 'Alumni - Tree 2' },
    { nodeId: 3, label: 'Chabad - Tree 1' },
  ];
  const entry = (nodeId, extra = {}) => ({
    ref: `ref-${nodeId}`,
    nodeId,
    treeLabel: `Tree ${nodeId}`,
    sapGallons: 4,
    syrupGallons: 0.1,
    sugar: null,
    queued: false,
    ...extra,
  });

  test('offers the next tree not yet logged, wrapping around, and nothing once all are done', () => {
    let round = startRound();
    expect(nextTreeToLog(trees, round, null).nodeId).toBe(1);

    round = addToRound(round, entry(1));
    expect(nextTreeToLog(trees, round, 1).nodeId).toBe(2);
    expect(nextTreeToLog(trees, round, null).nodeId).toBe(2);

    round = addToRound(round, entry(3));
    expect(nextTreeToLog(trees, round, 3).nodeId).toBe(2);

    round = addToRound(round, entry(2));
    expect(nextTreeToLog(trees, round, 2)).toBeNull();
    expect(nextTreeToLog([], round, null)).toBeNull();
  });

  test('adding an entry leaves the earlier round untouched', () => {
    const round = startRound();
    const next = addToRound(round, entry(1));
    expect(round.entries).toHaveLength(0);
    expect(next.entries).toHaveLength(1);
  });

  test('the clock starts at the first entry, so an idle page does not age the round', () => {
    const opened = new Date('2026-03-02T06:00:00.000Z');
    const round = startRound({ now: opened });
    const later = new Date('2026-03-02T20:00:00.000Z');
    expect(isRoundExpired(round, later)).toBe(true);

    const started = addToRound(round, entry(1), later);
    expect(started.startedAt).toBe(later.toISOString());
    expect(isRoundExpired(started, new Date(later.getTime() + 60_000))).toBe(false);
    expect(addToRound(started, entry(2), new Date()).startedAt).toBe(later.toISOString());
  });

  test('totals the trip, averaging sugar over only the trees tested', () => {
    let round = startRound();
    round = addToRound(round, entry(1, { sugar: 2 }));
    round = addToRound(round, entry(2, { sugar: 3, queued: true }));
    round = addToRound(round, entry(3));

    const totals = summarizeRound(round);
    expect(totals.trees).toBe(3);
    expect(totals.sapGallons).toBe(12);
    expect(totals.syrupGallons).toBeCloseTo(0.3, 5);
    expect(totals.tested).toBe(2);
    expect(totals.averageSugar).toBe(2.5);
    expect(totals.waiting).toBe(1);
  });

  test('a round with no sugar tests has no average rather than a zero', () => {
    const totals = summarizeRound(addToRound(startRound(), entry(1)));
    expect(totals.averageSugar).toBeNull();
    expect(totals.tested).toBe(0);
  });
});

describe('prefilling from the sensor', () => {
  const now = new Date('2026-03-02T14:00:00.000Z');
  const node = (overrides) => ({
    NodeID: 1,
    Weight: 42.5,
    Ice_Present: true,
    Status_Code: 1,
    Recorded_At: '2026-03-02T13:50:00.000Z',
    ...overrides,
  });

  test('uses a recent weight from a live node', () => {
    expect(sensorDefaults(node(), now)).toMatchObject({ weight: 42.5, ice: true, usable: true, reason: null });
  });

  test('does not trust a stale weight, or one from an offline node', () => {
    const old = new Date(now.getTime() - (SENSOR_FRESH_MINUTES + 5) * 60_000).toISOString();
    expect(sensorDefaults(node({ Recorded_At: old }), now)).toMatchObject({ usable: false, reason: 'stale' });
    expect(sensorDefaults(node({ Status_Code: 0 }), now)).toMatchObject({ usable: false, reason: 'offline' });
  });

  test('has nothing to offer for a tree with no weight', () => {
    expect(sensorDefaults(node({ Weight: null }), now)).toMatchObject({ usable: false, reason: 'none' });
    expect(sensorDefaults(null, now)).toMatchObject({ usable: false, reason: 'none' });
  });
});

describe('keeping the round on the phone', () => {
  test('resumes a fresh round and drops a stale or damaged one', () => {
    const store = memory();
    const now = new Date('2026-03-02T09:00:00.000Z');
    const round = addToRound(startRound({ label: 'North line', now }), { nodeId: 1 }, now);

    saveRound(round, store);
    expect(loadRound(store, new Date(now.getTime() + 3_600_000))).toEqual(round);

    const tooLate = new Date(now.getTime() + (ROUND_MAX_AGE_HOURS + 1) * 3_600_000);
    expect(loadRound(store, tooLate)).toBeNull();

    store.setItem('maple-collection-round', '{not json');
    expect(loadRound(store, now)).toBeNull();
    store.setItem('maple-collection-round', JSON.stringify({ label: 'no entries array' }));
    expect(loadRound(store, now)).toBeNull();
  });

  test('saving nothing clears the round', () => {
    const store = memory();
    saveRound(addToRound(startRound(), { nodeId: 1 }), store);
    saveRound(null, store);
    expect(loadRound(store)).toBeNull();
  });
});

describe('building the request', () => {
  test('stamps a client reference once and keeps the one an entry already has', () => {
    const fresh = toRequest({ NodeID: 1, Weight: 20 });
    expect(fresh.Client_Ref).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(toRequest({ NodeID: 1, Weight: 20, Client_Ref: 'kept' }).Client_Ref).toBe('kept');
  });

  test('sends null for sugar that was not tested', () => {
    expect(toRequest({ NodeID: 1, Weight: 20 }).Sugar_Percent).toBeNull();
    expect(toRequest({ NodeID: 1, Weight: 20, Sugar_Percent: undefined }).Sugar_Percent).toBeNull();
    expect(toRequest({ NodeID: 1, Weight: 20, Sugar_Percent: 2.2 }).Sugar_Percent).toBe(2.2);
  });

  test('reads an entry queued by the old form, so an update does not strand it', () => {
    const request = toRequest({
      Title: 'North line',
      Process_Notes: '  Batch AM.\nTaps checked.  ',
      NodeID: 3,
      BucketID: 9,
      Weight: 31,
      Sugar_Percent: 2.1,
      Ice_Present: false,
      Collected_At: '2026-03-02T14:00:00.000Z',
    });
    expect(request.Notes).toBe('Batch AM.\nTaps checked.');
    expect(request).not.toHaveProperty('Title');
    expect(request).not.toHaveProperty('BucketID');
    expect(request.Round_Label).toBeNull();
  });

  test('client references are unique', () => {
    const refs = new Set(Array.from({ length: 50 }, () => newClientRef()));
    expect(refs.size).toBe(50);
  });
});
