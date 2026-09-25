/**
 * Shelf life estimation for raw sap (FR-016).
 *
 * Raw sap is perishable. Its usable window collapses as temperature rises,
 * roughly halving for every 10F above freezing, and higher sugar content gives
 * bacteria more to work with.
 */

import { SPOILAGE_THRESHOLD_F } from './spoilage';

/** Hours a bucket of sap stays usable when held at or below freezing. */
export const BASE_SHELF_LIFE_HOURS = 96;
/** Each 10F above freezing roughly halves the remaining window. */
const HALVING_INTERVAL_F = 10;
const FREEZING_F = 32;

/** How far back a bucket's current contents are assumed to reach. */
const WINDOW_HOURS = 24;

/**
 * Total usable window for sap held at a given temperature.
 * Returns hours from the moment the sap entered the bucket.
 */
export function shelfLifeHours(temperatureF, sugarPercent = null) {
  if (temperatureF == null) return null;

  const degreesAboveFreezing = Math.max(0, temperatureF - FREEZING_F);
  const halvings = degreesAboveFreezing / HALVING_INTERVAL_F;
  let hours = BASE_SHELF_LIFE_HOURS / 2 ** halvings;

  // Sugar is bacterial feedstock at raw-sap concentrations. Above the typical
  // band, discount the window further.
  if (sugarPercent != null && sugarPercent > 3) {
    hours *= 1 - Math.min(0.3, (sugarPercent - 3) * 0.1);
  }

  return Math.max(0, hours);
}

/** Hours left before the sap in a bucket should be considered spoiled. */
export function remainingShelfLifeHours({ filledAt, temperatureF, sugarPercent, now = new Date() }) {
  const total = shelfLifeHours(temperatureF, sugarPercent);
  if (total == null || !filledAt) return null;

  const elapsed = (now - new Date(filledAt)) / 3_600_000;
  return Math.max(0, total - elapsed);
}

export function formatShelfLife(hours) {
  if (hours == null) return 'Unknown';
  if (hours <= 0) return 'Expired';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} hr`;
  return `${(hours / 24).toFixed(1)} days`;
}

/** Severity token for coloring a shelf-life readout. */
export function shelfLifeSeverity(hours) {
  if (hours == null) return 'info';
  if (hours <= 0) return 'error';
  if (hours < 12) return 'error';
  if (hours < 24) return 'warning';
  return 'success';
}

/**
 * Shelf life derived straight from a node's recent readings, using the warmest
 * recent temperature rather than the latest so a midday spike is not forgiven
 * by an evening cool-down.
 *
 * Measured as of the newest reading rather than the wall clock. For live data
 * those are the same moment, but for a past season the wall clock would report
 * every bucket as expired, which says nothing about how that season went.
 */
export function shelfLifeFromReadings(readings, { now } = {}) {
  const usable = readings?.filter((row) => row.Temperature != null) ?? [];
  if (usable.length === 0) return null;

  const sorted = [...usable].sort((a, b) => new Date(a.Recorded_At) - new Date(b.Recorded_At));
  const newest = sorted[sorted.length - 1];
  const asOf = now ?? new Date(newest.Recorded_At);

  // Only the last 24 hours count. Buckets are emptied at each collection, so
  // sap from earlier in the week is not what is sitting there now.
  const windowStart = new Date(asOf).getTime() - WINDOW_HOURS * 3_600_000;
  const recent = sorted.filter((row) => new Date(row.Recorded_At).getTime() >= windowStart);
  if (recent.length === 0) return null;

  const worstTemp = Math.max(...recent.map((row) => row.Temperature));
  const sugar = recent.map((row) => row.Sugar_Percent).filter((value) => value != null).at(-1);

  const filledAt = recent[0].Recorded_At;
  const hours = remainingShelfLifeHours({
    filledAt,
    temperatureF: worstTemp,
    sugarPercent: sugar,
    now: asOf,
  });

  return {
    hours,
    asOf: asOf.toISOString(),
    worstTemperature: worstTemp,
    exceededThreshold: worstTemp > SPOILAGE_THRESHOLD_F,
    severity: shelfLifeSeverity(hours),
    label: formatShelfLife(hours),
  };
}
