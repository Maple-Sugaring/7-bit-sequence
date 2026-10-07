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
