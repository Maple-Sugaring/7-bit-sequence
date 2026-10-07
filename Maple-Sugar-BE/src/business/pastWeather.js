/**
 * Earlier days of the current week, rebuilt from the live snapshots the API
 * stores each time it reads the forecast. OpenWeather only looks forward, so
 * these are the closest thing to what the day turned out to be.
 */

import { formatZoneDate, SUGARBUSH_TIME_ZONE } from './availability.js';
import { sapRunFromTemps } from './sapFlow.js';

export function addDays(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** The Sunday on or before a YYYY-MM-DD date. */
export function startOfWeek(date) {
  const [year, month, day] = date.split('-').map(Number);
  return addDays(date, -new Date(Date.UTC(year, month - 1, day)).getUTCDay());
}

const round1 = (value) => Math.round(Number(value) * 10) / 10;

/**
 * @param {Array<{observed_at: string|Date, temp_min_f: number|null, temp_max_f: number|null, precip_in: number|null, conditions: string|null}>} rows oldest first
 * @param {{today: string, weekStart: string, timeZone?: string}} window YYYY-MM-DD dates
 */
export function pastDaysFromSnapshots(rows, { today, weekStart, timeZone = SUGARBUSH_TIME_ZONE }) {
  const byDate = new Map();
  for (const item of rows ?? []) {
    if (item.temp_min_f == null || item.temp_max_f == null) continue;
    const date = formatZoneDate(new Date(item.observed_at), timeZone);
    if (date >= today || date < weekStart) continue;
    byDate.set(date, item); // later snapshots overwrite earlier ones
  }

  return [...byDate.keys()].sort().map((date) => {
    const item = byDate.get(date);
    const tempMinF = Number(item.temp_min_f);
    const tempMaxF = Number(item.temp_max_f);
    const precipIn = Number(item.precip_in ?? 0);
    const modeled = sapRunFromTemps({ tempMinF, tempMaxF, precipIn });
    return {
      Date: date,
      Temp_Min_F: round1(tempMinF),
      Temp_Max_F: round1(tempMaxF),
      Precip_In: precipIn,
      Conditions: item.conditions ?? 'Clear',
      Sap_Run: modeled.sapRun,
      Flow_Index: modeled.flowIndex,
      Flow_Gal: modeled.flowGal,
      Ice_Present: modeled.ice,
    };
  });
}

/** Dates from the week start up to, but not including, today. */
export function weekDatesBefore(today, weekStart) {
  const dates = [];
  for (let date = weekStart; date < today; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/** One Call 3.0 day_summary, in imperial units, to the same shape as a forecast day. */
export function dayFromSummary(date, summary) {
  const min = summary?.temperature?.min;
  const max = summary?.temperature?.max;
  if (min == null || max == null) return null;
  const precipIn = Math.round((Number(summary.precipitation?.total ?? 0) / 25.4) * 1000) / 1000;
  const modeled = sapRunFromTemps({ tempMinF: Number(min), tempMaxF: Number(max), precipIn });
  return {
    Date: date,
    Temp_Min_F: round1(min),
    Temp_Max_F: round1(max),
    Precip_In: precipIn,
    Conditions: precipIn > 0 ? 'Rain' : 'Clear',
    Sap_Run: modeled.sapRun,
    Flow_Index: modeled.flowIndex,
    Flow_Gal: modeled.flowGal,
    Ice_Present: modeled.ice,
  };
}

/** Provider day summaries win; stored snapshots cover whatever dates they miss. */
export function mergePastDays(summaries, snapshots) {
  const byDate = new Map((snapshots ?? []).map((day) => [day.Date, day]));
  for (const day of summaries ?? []) byDate.set(day.Date, day);
  return [...byDate.values()].sort((a, b) => a.Date.localeCompare(b.Date));
}
