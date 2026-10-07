import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { pastDaysFromSnapshots } from '../../src/business/pastWeather.js';

const row = (observedAt, min, max, precip = 0, conditions = 'clear sky') => ({
  observed_at: observedAt,
  temp_min_f: min,
  temp_max_f: max,
  precip_in: precip,
  conditions,
});

describe('pastDaysFromSnapshots', () => {
  test('keeps the last snapshot of each earlier day', () => {
    const days = pastDaysFromSnapshots(
      [
        row('2026-10-05T14:00:00Z', 20, 30),
        row('2026-10-05T20:00:00Z', 25, 40),
        row('2026-10-06T15:00:00Z', 28, 36),
      ],
      { today: '2026-10-07', weekStart: '2026-10-04', timeZone: 'UTC' },
    );
    assert.deepEqual(days.map((d) => d.Date), ['2026-10-05', '2026-10-06']);
    assert.equal(days[0].Temp_Min_F, 25);
    assert.equal(days[0].Temp_Max_F, 40);
    assert.equal(days[0].Sap_Run, true);
  });

  test('ignores today, other weeks and snapshots without temperatures', () => {
    const days = pastDaysFromSnapshots(
      [
        row('2026-10-07T12:00:00Z', 20, 40),
        row('2026-10-03T12:00:00Z', 20, 40),
        row('2026-10-05T12:00:00Z', null, null),
      ],
      { today: '2026-10-07', weekStart: '2026-10-04', timeZone: 'UTC' },
    );
    assert.deepEqual(days, []);
  });
});

import { dayFromSummary, mergePastDays, weekDatesBefore } from '../../src/business/pastWeather.js';

describe('dayFromSummary', () => {
  test('maps a One Call day_summary to a forecast day', () => {
    const day = dayFromSummary('2026-10-05', {
      temperature: { min: 24.3, max: 41.26 },
      precipitation: { total: 2.54 },
    });
    assert.equal(day.Date, '2026-10-05');
    assert.equal(day.Temp_Min_F, 24.3);
    assert.equal(day.Temp_Max_F, 41.3);
    assert.equal(day.Precip_In, 0.1);
    assert.equal(day.Sap_Run, true);
  });

  test('returns null when temperatures are missing', () => {
    assert.equal(dayFromSummary('2026-10-05', { temperature: {} }), null);
    assert.equal(dayFromSummary('2026-10-05', null), null);
  });
});

describe('weekDatesBefore', () => {
  test('lists the days from Sunday up to, not including, today', () => {
    assert.deepEqual(weekDatesBefore('2026-10-07', '2026-10-04'), ['2026-10-04', '2026-10-05', '2026-10-06']);
    assert.deepEqual(weekDatesBefore('2026-10-04', '2026-10-04'), []);
  });
});

describe('mergePastDays', () => {
  test('prefers the day summary and fills gaps from snapshots, in date order', () => {
    const summary = { Date: '2026-10-06', Temp_Min_F: 1, Temp_Max_F: 2 };
    const snapshotA = { Date: '2026-10-05', Temp_Min_F: 3, Temp_Max_F: 4 };
    const snapshotB = { Date: '2026-10-06', Temp_Min_F: 9, Temp_Max_F: 9 };
    const merged = mergePastDays([summary], [snapshotA, snapshotB]);
    assert.deepEqual(merged, [snapshotA, summary]);
  });
});
