/**
 * Rules for recording one collection (issue #28).
 *
 * A collection is a student emptying one tree's bucket. The weight is required
 * because it becomes the volume collected. Sugar content is optional: it is
 * only present when the student tested the sap with a refractometer, and an
 * untested collection stores no sugar at all rather than a guess.
 */

import { validateReading } from './validation.js';
import { LB_PER_GALLON } from './thresholds.js';

/** Alerts a finished collection closes, the same pair the dashboard's collect button closes. */
export const COLLECTION_ALERT_TYPES = ['Full Bucket', 'Collection Needed'];

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

/** Sap weight with the empty bucket taken off. Never negative. */
export function netSapWeight(grossLb, tareLb = 0) {
  return Math.max(0, Number(grossLb) - Number(tareLb ?? 0));
}

/**
 * Gallons of sap that came out of the bucket, from the scale. Gross weight
 * includes the bucket, so the tare comes off before the gallons are counted;
 * skipping that would credit every collection with a couple of pounds of
 * plastic.
 */
export function collectionVolumeGallons(grossLb, tareLb = 0) {
  return round2(netSapWeight(grossLb, tareLb) / LB_PER_GALLON);
}

/**
 * Field-keyed errors for a collection, in the shape the form attaches to
 * inputs. Reading checks (weight ceiling, sugar range, future dates) are reused
 * so a collection and a hand-entered reading can never disagree.
 */
export function validateCollection(input, { tareWeight = null } = {}) {
  const { errors } = validateReading(input);

  // validateReading wants a weight or a sugar value. A collection always wants
  // the weight, and sugar alone is not enough.
  if (isBlank(input.Sugar_Percent)) delete errors.Sugar_Percent;

  if (isBlank(input.Weight)) {
    errors.Weight = 'Enter the sap weight.';
  } else if (!errors.Weight && collectionVolumeGallons(input.Weight, tareWeight) <= 0) {
    errors.Weight = `That is not more than the empty bucket (${tareWeight ?? 0} lb). Check the scale.`;
  }

  return { errors, isValid: Object.keys(errors).length === 0 };
}

export function collectionTitle(nodeName) {
  return nodeName ? `Collected ${nodeName}` : 'Collection';
}
