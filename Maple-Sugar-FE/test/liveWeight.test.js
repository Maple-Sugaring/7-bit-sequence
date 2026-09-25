import { describe, expect, test } from 'vitest';

import { bucketPercent, dailyWeightRows, inLiveYear, isNodeReading, LIVE_NODE_IDS, presetRange, recordedSugar } from '../src/business/liveWeight';
import { BUCKET_CAPACITY_LB, LB_PER_GALLON } from '../src/business/yieldMetrics';

describe('2026 node weight', () => {
  test('keeps the last weight each tracked node sent on a day', () => {
    const sensor = { Temperature: null, Recorded_By_UserID: null };
    const { rows, series } = dailyWeightRows([
      { ...sensor, NodeID: 1, nodeName: 'Alumni House - Tree 1', Weight: 8, Recorded_At: '2026-09-25T12:00:00.000Z' },
      { ...sensor, NodeID: 1, nodeName: 'Alumni House - Tree 1', Weight: 9.5, Recorded_At: '2026-09-25T18:00:00.000Z' },
      { ...sensor, NodeID: 2, nodeName: 'Alumni House - Tree 2', Weight: 11, Recorded_At: '2026-09-25T18:05:00.000Z' },
      { ...sensor, NodeID: 7, nodeName: 'Chabad House - Tree 1', Weight: 40, Recorded_At: '2026-09-25T18:00:00.000Z' },
      { ...sensor, NodeID: 1, nodeName: 'Alumni House - Tree 1', Weight: 90, Recorded_At: '2024-02-01T17:00:00.000Z' },
      { NodeID: 1, nodeName: 'Alumni House - Tree 1', Weight: 50, Temperature: 41, Recorded_By_UserID: null, Recorded_At: '2026-03-01T18:00:00.000Z' },
    ]);

    expect(LIVE_NODE_IDS).toEqual([1, 2]);
    expect(rows[0].Date).toBe('2026-09-25');
    expect(rows[0][1]).toBeCloseTo(9.5 / LB_PER_GALLON);
    expect(rows[0][2]).toBeCloseTo(11 / LB_PER_GALLON);
    expect(bucketPercent(10.5, 2.17)).toBeCloseTo(((10.5 - 2.17) / LB_PER_GALLON / 10) * 100);
    expect(series.map((item) => item.key).sort()).toEqual(['1', '2']);
    expect(isNodeReading({ Weight: 8, Temperature: 40, Recorded_By_UserID: null })).toBe(false);
    expect(isNodeReading({ Weight: 8, Temperature: null, Recorded_By_UserID: 4 })).toBe(false);
  });

  test('range presets stay inside the requested window', () => {
    const now = new Date('2026-09-25T22:00:00.000Z');
    const week = presetRange('7d', now);
    expect(week.from.toISOString().slice(0, 10)).toBe('2026-09-19');
    expect(week.to.toISOString()).toBe(now.toISOString());
    const year = presetRange('2026', now);
    expect(year.from.toISOString().startsWith('2026-01-01')).toBe(true);
  });

  test('a full 10 gallon bucket is 83.4 lb of sap plus the empty bucket', () => {
    expect(LB_PER_GALLON).toBe(8.34);
    expect(BUCKET_CAPACITY_LB).toBeCloseTo(83.4);
    expect(bucketPercent(2.5 + BUCKET_CAPACITY_LB, 2.5)).toBeCloseTo(100);
    expect(bucketPercent(2.5, 2.5)).toBe(0);
  });

  test('sugar comes only from a recorded percent', () => {
    expect(inLiveYear('2026-09-25T21:00:00.000Z')).toBe(true);
    expect(inLiveYear('2024-02-01T17:00:00.000Z')).toBe(false);
    expect(recordedSugar([
      { Sugar_Percent: null, Recorded_At: '2026-09-25T21:00:00.000Z' },
      { Sugar_Percent: 2.4, Collected_At: '2026-03-02T15:00:00.000Z' },
      { Sugar_Percent: 2.1, Collected_At: '2024-03-02T15:00:00.000Z' },
    ])).toEqual([2.4]);
  });
});
