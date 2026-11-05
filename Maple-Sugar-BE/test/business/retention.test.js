import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  compactionWindows,
  isBeforeCutoff,
  isValidTimeZone,
  periodStart,
  rawCutoff,
  weightedMean,
} from '../../src/business/retention.js';

describe('retention cutoff (BRU-007)', () => {
  test('is the retention window back from now, floored to a UTC hour', () => {
    const cutoff = rawCutoff(new Date('2026-11-05T14:37:12.345Z'), 400);
    assert.equal(cutoff.toISOString(), '2025-10-01T14:00:00.000Z');
  });

  test('is off for zero or negative days', () => {
    assert.equal(rawCutoff(new Date(), 0), null);
    assert.equal(rawCutoff(new Date(), -5), null);
    assert.equal(isBeforeCutoff('2000-01-01T00:00:00Z', null), false);
  });

  test('a sample exactly at the cutoff stays raw; one millisecond earlier is compacted', () => {
    const cutoff = new Date('2025-10-01T14:00:00.000Z');
    assert.equal(isBeforeCutoff('2025-10-01T14:00:00.000Z', cutoff), false);
    assert.equal(isBeforeCutoff('2025-10-01T13:59:59.999Z', cutoff), true);
    assert.equal(isBeforeCutoff('not-a-date', cutoff), false);
  });

  test('periods are UTC hours regardless of the input offset', () => {
    assert.equal(periodStart('2026-03-08T01:59:59-05:00').toISOString(), '2026-03-08T06:00:00.000Z');
  });
});

describe('compaction windows', () => {
  test('split the backlog into UTC days ending exactly at the cutoff', () => {
    const windows = compactionWindows(new Date('2025-01-01T22:15:00Z'), new Date('2025-01-03T05:00:00Z'));
    assert.deepEqual(
      windows.map(({ start, end }) => [start.toISOString(), end.toISOString()]),
      [
        ['2025-01-01T22:00:00.000Z', '2025-01-02T00:00:00.000Z'],
        ['2025-01-02T00:00:00.000Z', '2025-01-03T00:00:00.000Z'],
        ['2025-01-03T00:00:00.000Z', '2025-01-03T05:00:00.000Z'],
      ],
    );
  });

  test('are empty when nothing is eligible', () => {
    assert.deepEqual(compactionWindows(null, new Date()), []);
    assert.deepEqual(compactionWindows(new Date('2025-01-03T05:00:00Z'), new Date('2025-01-03T05:00:00Z')), []);
  });
});

describe('weighted mean', () => {
  test('weights each part by its reading count, not one vote per period', () => {
    assert.equal(weightedMean([{ count: 3, sum: 60 }, { count: 1, sum: 100 }]), 40);
  });

  test('ignores empty parts and returns null with no data', () => {
    assert.equal(weightedMean([{ count: 0, sum: null }, null]), null);
    assert.equal(weightedMean([{ count: 0, sum: null }, { count: 2, sum: 5 }]), 2.5);
  });
});

describe('rollup time zones', () => {
  test('accepts IANA names and rejects anything else', () => {
    assert.equal(isValidTimeZone('America/New_York'), true);
    assert.equal(isValidTimeZone('UTC'), true);
    assert.equal(isValidTimeZone('Mars/Olympus'), false);
    assert.equal(isValidTimeZone("UTC'; drop table metrics; --"), false);
    assert.equal(isValidTimeZone(''), false);
  });
});
