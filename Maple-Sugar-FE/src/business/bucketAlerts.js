/**
 * Which bucket alert a weight reading raises (FR-003).
 *
 * The frontend prototype of the backend rule in Maple-Sugar-BE's
 * business/alerting.js. Mock mode runs it on every new reading so the warning
 * flow can be tried without a database; once it is settled, the backend's
 * deriveAlerts gets the same Collection Needed branch.
 */

import {
  BUCKET_CAPACITY_GALLONS,
  BUCKET_CAPACITY_LB,
  BucketLevel,
  bucketLevel,
  gallonsFromWeight,
  netWeight,
} from './yieldMetrics';

/** `{ Alert_Type, severity, Description }` for the reading, or null when the bucket is fine. */
export function bucketAlertFor({ nodeName, grossWeight, tareWeight = 0, icePresent = false }) {
  const level = bucketLevel(grossWeight, tareWeight);
  if (level == null || level === BucketLevel.OK) return null;

  const net = netWeight(grossWeight, tareWeight);
  const gallons = gallonsFromWeight(net).toFixed(1);
  const percent = Math.round((net / BUCKET_CAPACITY_LB) * 100);

  if (level === BucketLevel.FULL) {
    return {
      Alert_Type: 'Full Bucket',
      severity: 'warning',
      Description: icePresent
        ? `Net sap is ${gallons} gal at ${nodeName}. Ice is tagged, so the bucket can weigh more than the ${BUCKET_CAPACITY_GALLONS} gallon liquid line. Schedule a collection.`
        : `Net sap is ${gallons} gal at ${nodeName}, at the ${BUCKET_CAPACITY_GALLONS} gallon bucket capacity. Schedule a collection.`,
    };
  }

  return {
    Alert_Type: 'Collection Needed',
    severity: 'warning',
    Description:
      `Net sap is ${gallons} gal at ${nodeName}, ${percent}% of the ${BUCKET_CAPACITY_GALLONS} gallon line. ` +
      'Collect before it reaches capacity.',
  };
}

/**
 * What a Node Offline alert should add about the bucket it left behind, so a
 * silent node never reads as "fine" (FR-003 stale weight). Empty when unknown.
 */
export function lastFillNote({ grossWeight, tareWeight = 0 }) {
  const level = bucketLevel(grossWeight, tareWeight);
  if (level == null) return '';
  const net = netWeight(grossWeight, tareWeight);
  const note = `Last weight was ${gallonsFromWeight(net).toFixed(1)} gal (${Math.round((net / BUCKET_CAPACITY_LB) * 100)}%).`;
  return level === BucketLevel.OK
    ? note
    : `${note} Sap may have kept running: treat this bucket as possibly full and check it in person.`;
}
