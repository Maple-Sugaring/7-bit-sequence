/**
 * Retention and aggregation rules for sensor readings (BRU-007).
 
 * Raw readings older than the raw retention window are folded into hourly
 * aggregates so the hub does not keep every sample forever. Everything here is
 * pure so the boundary rules can be tested without a database.


 */

export const AGGREGATE_PERIOD_SECONDS = 3600;
const PERIOD_MS = AGGREGATE_PERIOD_SECONDS * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Below this a typo (4 for 400) would quietly delete last week's samples. */
export const MIN_RAW_RETENTION_DAYS = 30;
export const DEFAULT_RAW_RETENTION_DAYS = 400;


export const AGGREGATED_FIELDS = {
  Weight: 'weight',
  Temperature: 'temperature',
  Sugar_Percent: 'sugar_percent',
  Sap_Flow_Rate_Lph: 'sap_flow_rate_lph',


};

/** Rollup periods the API offers, as Postgres date_trunc units. */
export const ROLLUP_INTERVALS = ['hour', 'day', 'week', 'month'];
export const DEFAULT_ROLLUP_TIMEZONE = 'America/New_York';

/** Floors a time to the start of its UTC aggregate period. */
export function periodStart(at) {
  const ms = new Date(at).getTime();


  return new Date(Math.floor(ms / PERIOD_MS) * PERIOD_MS);
}

/**
 * Raw sensor rows strictly before this instant are eligible for aggregation.
 * Floored to an hour so a period is never split between raw and aggregate.
 * Null when retention is off (0 or negative days).
 */
export function rawCutoff(now, retentionDays) {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return null;
  return periodStart(new Date(now).getTime() - retentionDays * DAY_MS);
}



/** True when a sample falls in a period the retention job may already have compacted. */
export function isBeforeCutoff(recordedAt, cutoff) {
  if (!cutoff || recordedAt == null) return false;

  const ms = new Date(recordedAt).getTime();
  return Number.isFinite(ms) && ms < cutoff.getTime();
}

/**
 * Splits [from, cutoff) into whole UTC days, one per transaction, so an
 * interrupted run commits what it finished and the next run picks up the rest.
 * `from` is floored to a period so the first window starts on a boundary.
 */
export function compactionWindows(from, cutoff) {
  if (!from || !cutoff) return [];
  const end = cutoff.getTime();
  let start = periodStart(from).getTime();
  const windows = [];
  while (start < end) {
    const next = Math.min(Math.floor(start / DAY_MS) * DAY_MS + DAY_MS, end);
    windows.push({ start: new Date(start), end: new Date(next) });
    start = next;
  }
  return windows;
}



export function weightedMean(parts) {
  let count = 0;
  let sum = 0;
  for (const part of parts) {


    if (!part || !part.count) continue;
    count += part.count;
    sum += part.sum;

  }
  return count ? sum / count : null;
}





/** Validates an IANA zone the way both Node and Postgres will accept it. */
export function isValidTimeZone(zone) {
  if (typeof zone !== 'string' || !zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
