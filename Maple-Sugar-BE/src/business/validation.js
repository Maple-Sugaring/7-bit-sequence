/**
 * Domain validation, mirroring src/business/validation.js in the frontend.
 *
 * Deliberately returns the same field-keyed error map the client form builds,
 * because that map is sent back as the `details` payload of a 422 and the
 * Record Data page attaches each message to its own input. A generic message
 * here would degrade the form to a single banner.
 *
 * This duplicates the client checks on purpose: the client copy is there to
 * save a round trip, and this copy is the one that actually holds.
 */

import {
  BUCKET_CAPACITY_GALLONS,
  BUCKET_CAPACITY_LB,
  ICE_CAPACITY_GALLONS,
  ICE_CAPACITY_LB,
  MAX_TEMPERATURE_F,
  MIN_TEMPERATURE_F,
  RAW_SAP_MAX_PERCENT,
  RAW_SAP_MIN_PERCENT,
} from './thresholds.js';

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Validates a sap reading submitted by hand.
 *
 * Advisory checks the client shows as warnings are intentionally not enforced:
 * an unusual but genuine reading must still be recordable.
 */
export function validateReading(reading) {
  const errors = {};

  if (isBlank(reading.NodeID)) {
    errors.NodeID = 'Select the tree this reading came from.';
  }

  const hasWeight = !isBlank(reading.Weight);
  const hasSugar = !isBlank(reading.Sugar_Percent);

  if (!hasWeight && !hasSugar) {
    errors.Sugar_Percent = 'Enter a sugar percentage, a weight, or both.';
  }

  if (hasSugar) {
    const sugar = asNumber(reading.Sugar_Percent);
    if (sugar == null) {
      errors.Sugar_Percent = 'Sugar content must be a number.';
    } else if (sugar < RAW_SAP_MIN_PERCENT || sugar > RAW_SAP_MAX_PERCENT) {
      errors.Sugar_Percent = `Raw sap readings fall between ${RAW_SAP_MIN_PERCENT}% and ${RAW_SAP_MAX_PERCENT}%.`;
    }
  }

  if (hasWeight) {
    const weight = asNumber(reading.Weight);
    if (weight == null) {
      errors.Weight = 'Weight must be a number.';
    } else if (weight < 0) {
      errors.Weight = 'Weight cannot be negative.';
    } else {
      // Gross weight includes a couple of pounds of bucket. Ice may exceed the
      // 10 gallon liquid line; a liquid reading that heavy is a unit slip
      // unless the ice tag is on.
      const ice = Boolean(reading.Ice_Present);
      const ceiling = (ice ? ICE_CAPACITY_LB : BUCKET_CAPACITY_LB) + 8;
      if (weight > ceiling) {
        errors.Weight = ice
          ? `Even with ice, readings above about ${ICE_CAPACITY_GALLONS} gallons are rejected. Check the units.`
          : `A liquid bucket holds ${BUCKET_CAPACITY_GALLONS} gallons. Tag ice if frozen sap is heavier than that.`;
      }
    }
  }

  if (!isBlank(reading.Temperature)) {
    const temperature = asNumber(reading.Temperature);
    if (temperature == null) {
      errors.Temperature = 'Temperature must be a number.';
    } else if (temperature < MIN_TEMPERATURE_F || temperature > MAX_TEMPERATURE_F) {
      errors.Temperature = `Enter a temperature between ${MIN_TEMPERATURE_F}F and ${MAX_TEMPERATURE_F}F.`;
    }
  }

  if (!isBlank(reading.Recorded_At)) {
    const recordedAt = new Date(reading.Recorded_At);
    if (Number.isNaN(recordedAt.getTime())) {
      errors.Recorded_At = 'That is not a valid date and time.';
    } else if (recordedAt > new Date(Date.now() + 60_000)) {
      // A minute of slack, so a client clock running slightly fast does not
      // reject a legitimate reading taken just now.
      errors.Recorded_At = 'Readings cannot be dated in the future.';
    }
  }

  return { errors, isValid: Object.keys(errors).length === 0 };
}

export function validateCollectionLog(entry) {
  const errors = {};

  if (isBlank(entry.NodeID)) errors.NodeID = 'Select the tree this came from.';
  if (isBlank(entry.BucketID)) errors.BucketID = 'Select the bucket that was emptied.';

  if (isBlank(entry.Volume_Collected)) {
    errors.Volume_Collected = 'Enter the volume collected.';
  } else {
    const volume = asNumber(entry.Volume_Collected);
    if (volume == null) {
      errors.Volume_Collected = 'Volume must be a number.';
    } else if (volume <= 0) {
      errors.Volume_Collected = 'Volume must be greater than zero.';
    }
  }

  return { errors, isValid: Object.keys(errors).length === 0 };
}
