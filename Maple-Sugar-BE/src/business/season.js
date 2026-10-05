/**
 * Sap season derivation, matching `seasonOf` in the frontend's mock transport
 * and the `sap_season()` SQL function in migration 002.
 *
 * All three must agree, or a reading filed in one season is queried out of
 * another. UTC-fixed on purpose: a local-time reading would put a late-evening
 * June 30 reading in a different season depending on who is looking.
 */

/** First month (1-based) that belongs to the following year's season. */
const NEXT_SEASON_FROM_MONTH = 7;

/** Screens ask for this calendar year when a compare year is omitted. */
export const DEFAULT_COMPARE_YEAR = 2026;

export function seasonOf(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return null;

  const year = value.getUTCFullYear();
  // getUTCMonth is 0-based; July is 6.
  return value.getUTCMonth() + 1 >= NEXT_SEASON_FROM_MONTH ? year + 1 : year;
}

export function currentSeason(now = new Date()) {
  return seasonOf(now);
}
