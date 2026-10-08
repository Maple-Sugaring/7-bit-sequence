import { describe, expect, it } from 'vitest';
import { entriesInWeek, weekLabel, weekStart, weekDays } from '../src/business/weekWindows';

describe('weekStart', () => {
  it('returns the Sunday on or before the date', () => {
    expect(weekStart('2026-10-07')).toBe('2026-10-04');
    expect(weekStart('2026-10-04')).toBe('2026-10-04');
    expect(weekStart('2026-10-10')).toBe('2026-10-04');
  });
});

describe('weekDays', () => {
  it('lists Sunday through Saturday', () => {
    const days = weekDays('2026-10-04');
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-10-04');
    expect(days[6]).toBe('2026-10-10');
  });
});

describe('weekLabel', () => {
  it('shows the seven day span', () => {
    expect(weekLabel('2026-10-04')).toBe('Oct 4 – Oct 10');
  });
});

describe('entriesInWeek', () => {
  const entries = [
    { id: 'a', Collected_At: '2026-10-04T15:00:00' },
    { id: 'b', Collected_At: '2026-10-10T23:00:00' },
    { id: 'c', Collected_At: '2026-10-11T01:00:00' },
    { id: 'd', Collected_At: '2026-10-03T12:00:00' },
  ];
  it('keeps only entries inside the week', () => {
    expect(entriesInWeek(entries, '2026-10-04').map((e) => e.id)).toEqual(['a', 'b']);
  });
});

import { weekForecastRows } from '../src/business/weekWindows';

describe('weekForecastRows', () => {
  it('returns seven Sunday to Saturday rows and fills days that have data', () => {
    const rows = weekForecastRows([{ Date: '2026-10-07', Temp_Max_F: 50 }, { Date: '2026-10-08', Temp_Max_F: 48 }], '2026-10-07');
    expect(rows.map((r) => r.Date)[0]).toBe('2026-10-04');
    expect(rows).toHaveLength(7);
    expect(rows[3].Temp_Max_F).toBe(50);
    expect(rows[0].Temp_Max_F).toBeUndefined();
  });
});

describe('week boundaries', () => {
  it('crosses month and year ends', () => {
    expect(weekStart('2026-01-01')).toBe('2025-12-28');
    expect(weekLabel('2025-12-28')).toBe('Dec 28 – Jan 3');
    expect(weekDays('2026-02-22')[6]).toBe('2026-02-28');
  });
});
