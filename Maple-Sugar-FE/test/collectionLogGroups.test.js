import { describe, expect, test } from 'vitest';

import { dayLabel, displayNote, formatGallons, groupLogsByDay, volumeOf } from '../src/business/collectionLogGroups';

const now = new Date(2026, 10, 18, 22, 0);
const at = (day, hour) => new Date(2026, 10, day, hour).toISOString();

describe('collection log grouping', () => {
  test('groups by day in order and totals each day', () => {
    const { days, largest } = groupLogsByDay(
      [
        { LogID: 3, Collected_At: at(18, 21), Volume_Collected: '0.02' },
        { LogID: 2, Collected_At: at(18, 20), Volume_Collected: 3.6 },
        { LogID: 1, Collected_At: at(15, 9), Volume_Collected: null },
      ],
      now,
    );
    expect(days.map((day) => day.label)).toEqual(['Today', expect.stringMatching(/Nov 15/)]);
    expect(days[0].logs).toHaveLength(2);
    expect(days[0].totalGallons).toBeCloseTo(3.62);
    expect(largest).toBe(3.6);
  });

  test('names today and yesterday', () => {
    expect(dayLabel(new Date(2026, 10, 18, 1), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 10, 17, 23), now)).toBe('Yesterday');
  });

  test('formats volumes without trailing zeros and tolerates missing ones', () => {
    expect(formatGallons(2.5800001)).toBe('2.58');
    expect(formatGallons(3.6)).toBe('3.6');
    expect(volumeOf({ Volume_Collected: '0.3' })).toBe(0.3);
    expect(volumeOf({ Volume_Collected: null })).toBeNull();
  });

  test('drops the test sample marker from notes', () => {
    expect(displayNote({ Quality_Notes: '[Test sample] Test collection round 1' })).toBe('Test collection round 1');
    expect(displayNote({})).toBe('');
  });
});
