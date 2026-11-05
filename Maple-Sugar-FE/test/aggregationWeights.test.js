import { describe, expect, test } from 'vitest';

import { average, dailySeries, readingCount, samplesIn } from '../src/business/aggregation';

// One hourly aggregate from the hub (three readings averaging 20 lb, one sugar
// reading) next to one raw reading of 100 lb on the same day.
const hourly = {
  Recorded_At: '2025-03-20T13:00:00.000Z',
  Weight: 20,
  netWeight: 18,
  Sugar_Percent: 2,
  Aggregated: true,
  Aggregate: { Sample_Count: 3, Counts: { Weight: 3, Sugar_Percent: 1, Temperature: 0 } },
};
const raw = { Recorded_At: '2025-03-20T15:00:00.000Z', Weight: 100, netWeight: 98, Sugar_Percent: 4 };

describe('averaging over hub aggregates (BRU-007)', () => {
  test('a raw row is one reading; an aggregate is as many as it represents per field', () => {
    expect(samplesIn(raw, 'Weight')).toBe(1);
    expect(samplesIn(hourly, 'Weight')).toBe(3);
    expect(samplesIn(hourly, 'netWeight')).toBe(3);
    expect(samplesIn(hourly, 'Sugar_Percent')).toBe(1);
  });

  test('averages weight each reading equally, not each row', () => {
    expect(average([hourly, raw], 'Weight')).toBe((20 * 3 + 100) / 4);
    expect(average([hourly, raw], 'netWeight')).toBe((18 * 3 + 98) / 4);
    expect(average([hourly, raw], 'Sugar_Percent')).toBe(3);
    expect(average([raw, { Weight: 50 }], 'Weight')).toBe(75);
  });

  test('daily series use the weighted mean and count the underlying readings', () => {
    const [day] = dailySeries([hourly, raw], 'Weight');
    expect(day.value).toBe(40);
    expect(day.count).toBe(4);
    expect(readingCount([hourly, raw])).toBe(4);
  });
});
