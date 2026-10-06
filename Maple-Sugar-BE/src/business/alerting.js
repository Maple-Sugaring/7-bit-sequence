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
  CELL_CAPACITY_LB,
  CRITICAL_EXPOSURE_HOURS,
  FULL_MARGIN_LB,
  LB_PER_GALLON,
  LOW_BATTERY_PERCENT,
  MAX_STEP_LB,
  SPOILAGE_THRESHOLD_F,
  STALE_AFTER_MINUTES,
  WEAK_RSSI_DBM,
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
export function deriveAlerts({ reading, history = [], tareWeight = null, intervalSeconds = null }) {
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

    // A load cell that had the bucket and then reads far below the empty bucket
    // has lost it. A scale that was tared empty sits near zero on purpose.
    const previousWeight = history.find((row) => row.Weight != null)?.Weight;
    const bucketWasOn = previousWeight != null && previousWeight >= tareWeight * 0.8;
    if (bucketWasOn && reading.Weight < tareWeight * 0.5) {
      derived.push({
        Alert_Type: 'Tipped',
        severity: 'critical',
        Description:
          `Load cell at ${nodeLabel} reported ${reading.Weight.toFixed(1)} lb, ` +
          `below the ${tareWeight.toFixed(1)} lb tare. Probable tipover.`,
      });
    }
  }

  if (reading.Weight != null && reading.Weight > CELL_CAPACITY_LB) {
    derived.push({
      Alert_Type: 'Incorrect Reading',
      severity: 'critical',
      Description:
        `${nodeLabel} reported ${reading.Weight.toFixed(1)} lb, past the ` +
        `${CELL_CAPACITY_LB} lb load cell. The sample was not usable.`,
    });
  }

  const previous = history.find((row) => row.Weight != null && row.Recorded_At);
  if (previous && reading.Weight != null && reading.Recorded_At) {
    const gapMin = (new Date(reading.Recorded_At) - new Date(previous.Recorded_At)) / 60_000;
    const step = Math.abs(reading.Weight - previous.Weight);
    if (gapMin >= 0 && gapMin <= 10 && step > MAX_STEP_LB) {
      derived.push({
        Alert_Type: 'Incorrect Reading',
        severity: 'warning',
        Description:
          `${nodeLabel} jumped ${step.toFixed(1)} lb in ${gapMin.toFixed(0)} minutes. ` +
          `Sap cannot move that fast, so this sample was kept but should be checked.`,
      });
    }

    const intervalMin = Math.max(1, (intervalSeconds ?? 900) / 60);
    const missed = gapMin > 0 ? Math.floor(gapMin / intervalMin) - 1 : 0;
    if (missed >= 1 && gapMin < STALE_AFTER_MINUTES) {
      derived.push({
        Alert_Type: 'Missed Readings',
        severity: 'warning',
        Description:
          `${nodeLabel} missed ${missed} report${missed === 1 ? '' : 's'} ` +
          `before this one (${gapMin.toFixed(0)} minutes since the previous sample).`,
      });
    }
  }

  if (reading.Battery_Percent != null && reading.Battery_Percent < LOW_BATTERY_PERCENT) {
    derived.push({
      Alert_Type: 'Low Battery',
      severity: 'warning',
      Description: `${nodeLabel} battery is at ${Math.round(reading.Battery_Percent)}%. Swap the pack.`,
    });
  }

  if (reading.Signal_Rssi != null && reading.Signal_Rssi < WEAK_RSSI_DBM) {
    derived.push({
      Alert_Type: 'Signal Loss',
      severity: 'warning',
      Description:
        `${nodeLabel} was heard at ${Math.round(reading.Signal_Rssi)} dBm. ` +
        `Check the antenna and the path back to the gateway.`,
    });
  }

  return derived;
}

/** How a node-reported fault should be shown. Unknown codes are ignored. */
export function alertForFault(fault, nodeLabel = 'The node') {
  switch (fault) {
    case 'load-cell':
      return {
        Alert_Type: 'Load Cell',
        severity: 'critical',
        Description: `${nodeLabel} could not read the HX711. Check power and the amplifier wiring.`,
      };
    case 'unstable':
      return {
        Alert_Type: 'Unstable Reading',
        severity: 'warning',
        Description: `${nodeLabel} samples disagreed during one measurement. The weight was not stored.`,
      };
    case 'reversed':
      return {
        Alert_Type: 'Reversed Load Cell',
        severity: 'critical',
        Description: `${nodeLabel} weight went negative. The cell is wired backwards or loaded in tension.`,
      };
    case 'untared':
      return {
        Alert_Type: 'Untared',
        severity: 'warning',
        Description: `${nodeLabel} has not been tared. Hold PRG for 3 seconds with the platform empty.`,
      };
    default:
      return null;
  }
}

/**
 * Alert types a trustworthy weight clears. A fault packet does not clear the
 * electrical alerts, because the cell is still the thing that failed.
 */
export function clearedAlertTypes(reading) {
  if (reading?.Fault) return [];
  const clear = ['Node Offline', 'Missed Readings', 'Load Cell', 'Untared'];
  if (reading?.Battery_Percent == null || reading.Battery_Percent >= LOW_BATTERY_PERCENT) {
    clear.push('Low Battery');
  }
  if (reading?.Signal_Rssi == null || reading.Signal_Rssi >= WEAK_RSSI_DBM) {
    clear.push('Signal Loss');
  }
  if (reading?.Weight != null && reading.Weight >= 0 && reading.Weight <= CELL_CAPACITY_LB) {
    clear.push('Incorrect Reading', 'Unstable Reading', 'Reversed Load Cell');
  }
  return clear;
}
