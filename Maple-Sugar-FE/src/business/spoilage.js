/**
 * Spoilage detection (FR-018).
 *
 * Microbial growth in raw sap accelerates sharply above 40F. The system must
 * alert once a reading crosses that line, and escalate the longer it stays there.
 */

export const SPOILAGE_THRESHOLD_F = 40;
/** Below this, sap is effectively held in cold storage by the weather. */
export const SAFE_THRESHOLD_F = 34;
/** Hours above threshold before the risk is treated as critical rather than elevated. */
export const CRITICAL_EXPOSURE_HOURS = 4;

export const SpoilageRisk = {
  SAFE: 'safe',
  WATCH: 'watch',
  ELEVATED: 'elevated',
  CRITICAL: 'critical',
};

export const SPOILAGE_SEVERITY = {
  [SpoilageRisk.SAFE]: 'success',
  [SpoilageRisk.WATCH]: 'info',
  [SpoilageRisk.ELEVATED]: 'warning',
  [SpoilageRisk.CRITICAL]: 'error',
};

export function riskFromTemperature(temperatureF) {
  if (temperatureF == null || Number.isNaN(temperatureF)) return SpoilageRisk.SAFE;
  if (temperatureF > SPOILAGE_THRESHOLD_F) return SpoilageRisk.ELEVATED;
  if (temperatureF > SAFE_THRESHOLD_F) return SpoilageRisk.WATCH;
  return SpoilageRisk.SAFE;
}

/**
 * Consecutive hours the most recent readings have spent above the threshold,
 * walking backwards from the newest reading until one drops below.
 *
 * Only the span between above-threshold samples counts. Attributing the gap
 * back to the last safe sample would charge a warm afternoon with the whole
 * overnight freeze that separated it from the previous reading.
 */
export function hoursAboveThreshold(readings) {
  const sorted = [...readings]
    .filter((row) => row.Temperature != null)
    .sort((a, b) => new Date(b.Recorded_At) - new Date(a.Recorded_At));

  if (sorted.length === 0) return 0;
  if (sorted[0].Temperature <= SPOILAGE_THRESHOLD_F) return 0;

  let oldestAbove = sorted[0];
  for (const row of sorted) {
    if (row.Temperature <= SPOILAGE_THRESHOLD_F) break;
    oldestAbove = row;
  }

  const newest = new Date(sorted[0].Recorded_At);
  return Math.max(0, (newest - new Date(oldestAbove.Recorded_At)) / 3_600_000);
}

/** Full assessment for one node, combining the latest reading with its history. */
export function assessSpoilage(readings) {
  if (!readings?.length) {
    return { risk: SpoilageRisk.SAFE, hoursExposed: 0, latestTemperature: null, reason: 'No readings yet.' };
  }

  const latest = [...readings]
    .filter((row) => row.Temperature != null)
    .sort((a, b) => new Date(b.Recorded_At) - new Date(a.Recorded_At))[0];

  const hoursExposed = hoursAboveThreshold(readings);
  let risk = riskFromTemperature(latest?.Temperature);

  if (risk === SpoilageRisk.ELEVATED && hoursExposed >= CRITICAL_EXPOSURE_HOURS) {
    risk = SpoilageRisk.CRITICAL;
  }

  const reason = {
    [SpoilageRisk.SAFE]: 'Sap is holding below 34F.',
    [SpoilageRisk.WATCH]: 'Approaching the 40F spoilage threshold.',
    [SpoilageRisk.ELEVATED]: `Above 40F for ${hoursExposed.toFixed(1)} hours.`,
    [SpoilageRisk.CRITICAL]: `Above 40F for ${hoursExposed.toFixed(1)} hours. Collect or discard.`,
  }[risk];

  return { risk, hoursExposed, latestTemperature: latest?.Temperature ?? null, reason };
}
