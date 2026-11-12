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
 * The checks on an iced bucket's reweigh. `Weight` is the weight after the ice
 * came out, and `Weight_Before_Ice` the first weight with the ice still in.
 * Returns the error for the after-ice field, or null.
 */
export function weightAfterIceError(afterIce, beforeIce) {
  if (isBlank(afterIce)) return 'Remove the ice, reweigh the bucket, and enter the new weight.';
  const after = Number(afterIce);
  const before = Number(beforeIce);
  if (!Number.isFinite(after) || after < 0) return 'Enter the weight in pounds.';
  if (Number.isFinite(before) && after >= before) {
    return `Should be less than the weight with ice (${before} lb). Check the ice is out and the bucket is back on the sensor.`;
  }
  return null;
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

  // An iced bucket sends both weights: Weight is the reweigh after the ice came
  // out, Weight_Before_Ice the first one. Ice entries from before this flow, or
  // still queued on a phone from an older version, have no first weight and are
  // accepted as they were.
  if (!isBlank(input.Weight_Before_Ice)) {
    if (!input.Ice_Present) {
      errors.Weight_Before_Ice = 'A weight before ice only goes with a bucket tagged as having ice.';
    } else {
      const before = validateReading({ Weight: input.Weight_Before_Ice, Ice_Present: true }).errors.Weight;
      if (before) errors.Weight_Before_Ice = before;
      else if (!errors.Weight) {
        const after = weightAfterIceError(input.Weight, input.Weight_Before_Ice);
        if (after) errors.Weight = after;
      }
    }
  }

  return { errors, isValid: Object.keys(errors).length === 0 };
}

export function collectionTitle(nodeName) {
  return nodeName ? `Collected ${nodeName}` : 'Collection';
}
