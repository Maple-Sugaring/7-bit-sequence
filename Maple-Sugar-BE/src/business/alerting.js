/**
 * Derives alerts from incoming sensor readings.
 *
 * The alerts table has to be populated by something. The frontend computes
 * spoilage risk for display, but a warning nobody is looking at the dashboard
 * to see is not an alert, so detection runs here on write instead.
 *
 * Pure: takes a reading plus recent history and returns the alerts that should
 * exist. Deduplication against already-open alerts is the caller's job, since
 * that needs the database.
 */

import {
  BUCKET_CAPACITY_GALLONS,
  BUCKET_CAPACITY_LB,
  CRITICAL_EXPOSURE_HOURS,
  FULL_MARGIN_LB,
  LB_PER_GALLON,
  SPOILAGE_THRESHOLD_F,
} from './thresholds.js';

/**
 * Consecutive hours the most recent readings have spent above the spoilage
 * threshold, walking back from the newest until one drops below.
 *
 * Only the span between above-threshold samples counts. Charging the gap back
 * to the last safe sample would blame a warm afternoon for the whole overnight
 * freeze that preceded it.
 */
export function hoursAboveThreshold(readings) {
  const sorted = [...readings]
    .filter((row) => row.Temperature != null)
    .sort((a, b) => new Date(b.Recorded_At) - new Date(a.Recorded_At));

  if (!sorted.length) return 0;
  if (sorted[0].Temperature <= SPOILAGE_THRESHOLD_F) return 0;

  let oldestAbove = sorted[0];
  for (const row of sorted) {
    if (row.Temperature <= SPOILAGE_THRESHOLD_F) break;
    oldestAbove = row;
  }

  const newest = new Date(sorted[0].Recorded_At);
  return Math.max(0, (newest - new Date(oldestAbove.Recorded_At)) / 3_600_000);
}

/**
 * Alerts implied by `reading`, given the node's recent history and the tare
 * weight of the attached bucket.
 *
 * Returns `{ Alert_Type, severity, Description }` objects, or an empty array.
 */
export function deriveAlerts({ reading, history = [], tareWeight = null }) {
  const derived = [];
  const nodeLabel = reading.Node_Name ?? `Node ${reading.NodeID}`;

  // --- Spoilage: only once exposure has been sustained. A single warm reading
  // is normal on any thaw afternoon and would alert every single day. ---
  if (reading.Temperature != null && reading.Temperature > SPOILAGE_THRESHOLD_F) {
    const exposed = hoursAboveThreshold([reading, ...history]);
    if (exposed >= CRITICAL_EXPOSURE_HOURS) {
      derived.push({
        Alert_Type: 'Spoilage',
        severity: 'critical',
        Description:
          `Sap temperature held above ${SPOILAGE_THRESHOLD_F}F for ` +
          `${exposed.toFixed(1)} consecutive hours at ${nodeLabel}. Collect or discard.`,
      });
    }
  }

  // --- Bucket state, which needs the tare to say anything about net sap. ---
  if (reading.Weight != null && tareWeight != null) {
    const net = reading.Weight - tareWeight;
    const ice = Boolean(reading.Ice_Present);
    const gallons = net / LB_PER_GALLON;

    if (net >= BUCKET_CAPACITY_LB - FULL_MARGIN_LB) {
      derived.push({
        Alert_Type: 'Full Bucket',
        severity: 'warning',
        Description: ice
          ? `Net sap is ${gallons.toFixed(1)} gal at ${nodeLabel}. Ice is tagged, so the bucket can weigh more than the ${BUCKET_CAPACITY_GALLONS} gallon liquid line. Schedule a collection.`
          : `Net sap is ${gallons.toFixed(1)} gal at ${nodeLabel}, at the ${BUCKET_CAPACITY_GALLONS} gallon bucket capacity. Schedule a collection.`,
      });
    }

    // A load cell reading below the empty bucket's own weight means the bucket
    // is no longer hanging on it.
    if (reading.Weight < tareWeight * 0.5) {
      derived.push({
        Alert_Type: 'Tipped',
        severity: 'critical',
        Description:
          `Load cell at ${nodeLabel} reported ${reading.Weight.toFixed(1)} lb, ` +
          `below the ${tareWeight.toFixed(1)} lb tare. Probable tipover.`,
      });
    }
  }

  return derived;
}
