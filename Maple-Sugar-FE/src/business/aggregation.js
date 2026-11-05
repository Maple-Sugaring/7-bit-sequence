/**
 * Aggregation and season comparison (FR-013, FR-036, BRU-007).
 *
 * BRU-007 calls for averaging data to save space on the central hub, so the
 * same bucketing used for display is what the hub would roll up to.
 */

import dayjs from 'dayjs';

/**
 * A sap season is named for the calendar year it runs in. Readings after June
 * belong to the next season, which matters for fall planning data.
 */
export function seasonOf(isoDate) {
  const date = dayjs(isoDate);
  return date.month() >= 6 ? date.year() + 1 : date.year();
}

export function availableSeasons(rows, dateField = 'Recorded_At') {
  const seasons = new Set(rows.map((row) => seasonOf(row[dateField])));
  return [...seasons].sort((a, b) => b - a);
}

/**
 * Semester filter for the "by semester" views the user stories ask for.
 * Spring covers the sap season itself; Fall covers off-season prep.
 */
export const SEMESTERS = [
  { id: 'spring', label: 'Spring', months: [0, 1, 2, 3, 4] },
  { id: 'summer', label: 'Summer', months: [5, 6, 7] },
  { id: 'fall', label: 'Fall', months: [8, 9, 10, 11] },
];

export function semesterOf(isoDate) {
  const month = dayjs(isoDate).month();
  return SEMESTERS.find((semester) => semester.months.includes(month))?.id ?? null;
}

const mean = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function numeric(rows, field) {
  return rows.map((row) => row[field]).filter((value) => value != null && Number.isFinite(value));
}

const SOURCE_FIELD = { netWeight: 'Weight', gallons: 'Weight', fillPercent: 'Weight' };

export function samplesIn(row, field) {
  const aggregate = row?.Aggregate;
  if (!aggregate) return 1;
  const counts = aggregate.Counts ?? {};
  const source = SOURCE_FIELD[field] ?? field;
  return counts[source] ?? aggregate.Sample_Count ?? 1;
}

/** Total readings behind a set of rows, raw and aggregated. */
export function readingCount(rows) {
  return rows.reduce((total, row) => total + (row?.Aggregate?.Sample_Count ?? 1), 0);
}

/** Mean weighted by readings per row, so hourly averages and raw rows combine correctly. */
export function average(rows, field) {
  let weight = 0;
  let total = 0;
  for (const row of rows) {
    const value = row[field];
    if (value == null || !Number.isFinite(value)) continue;
    const samples = samplesIn(row, field);
    weight += samples;
    total += value * samples;
  }
  return weight ? total / weight : null;
}

export function maximum(rows, field) {
  const values = numeric(rows, field);
  return values.length ? Math.max(...values) : null;
}

export function minimum(rows, field) {
  const values = numeric(rows, field);
  return values.length ? Math.min(...values) : null;
}

/** Groups rows by a derived key, preserving insertion order. */
export function groupBy(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

/**
 * Daily rollup of a numeric field, sorted chronologically. This is the shape
 * MUI X line charts consume directly.
 */
export function dailySeries(rows, field, { dateField = 'Recorded_At', reducer = mean } = {}) {
  const byDay = groupBy(rows, (row) => dayjs(row[dateField]).format('YYYY-MM-DD'));

  return [...byDay.entries()]
    .map(([day, group]) => ({
      date: day,
      timestamp: dayjs(day).valueOf(),
      // The default mean is weighted so a day mixing raw readings and hourly
      // aggregates still averages every underlying reading equally.
      value: reducer === mean ? average(group, field) : reducer(numeric(group, field)),
      count: readingCount(group),
    }))
    .filter((point) => point.value != null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

const sum = (values) => values.reduce((total, value) => total + value, 0);

export function dailyTotals(rows, field, options = {}) {
  return dailySeries(rows, field, { ...options, reducer: sum });
}

/**
 * Year-over-year comparison (FR-013). Each season is re-indexed to "day N of
 * the season" so runs that started on different calendar dates line up.
 */
export function seasonComparisonSeries(rows, field, { dateField = 'Recorded_At' } = {}) {
  const bySeason = groupBy(rows, (row) => seasonOf(row[dateField]));
  const series = [];

  for (const [season, group] of bySeason) {
    const sorted = [...group].sort((a, b) => new Date(a[dateField]) - new Date(b[dateField]));
    if (sorted.length === 0) continue;

    const seasonStart = dayjs(sorted[0][dateField]).startOf('day');
    const daily = dailySeries(sorted, field, { dateField });

    series.push({
      season,
      points: daily.map((point) => ({
        dayOfSeason: dayjs(point.date).diff(seasonStart, 'day'),
        value: point.value,
      })),
    });
  }

  return series.sort((a, b) => a.season - b.season);
}

/**
 * Aligns multiple season series onto one x-axis of season days, producing the
 * `{ dayOfSeason, [season]: value }` rows a multi-line chart needs.
 */
export function alignSeasonSeries(series) {
  const maxDay = Math.max(0, ...series.flatMap((entry) => entry.points.map((p) => p.dayOfSeason)));
  const rows = [];

  for (let day = 0; day <= maxDay; day += 1) {
    const row = { dayOfSeason: day };
    for (const entry of series) {
      row[entry.season] = entry.points.find((point) => point.dayOfSeason === day)?.value ?? null;
    }
    rows.push(row);
  }

  return rows;
}

/** Percentage change between two values, guarding against a zero baseline. */
export function percentChange(current, previous) {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
