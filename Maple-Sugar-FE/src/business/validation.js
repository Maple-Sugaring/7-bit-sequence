/**
 * Input validation (FR-025, FR-057, and the user story requiring an error
 * message when required values are missing).
 *
 * Returns a field-keyed error map so the form can attach messages to inputs
 * rather than showing one generic banner.
 */

import {
  RAW_SAP_MAX_PERCENT,
  RAW_SAP_MIN_PERCENT,
  RAW_SAP_TYPICAL_MAX,
  RAW_SAP_TYPICAL_MIN,
} from './sugarContent';
import { BUCKET_CAPACITY_LB } from './yieldMetrics';

/** Plausible ambient range for a Rochester sap season, in Fahrenheit. */
export const MIN_TEMPERATURE_F = -30;
export const MAX_TEMPERATURE_F = 90;

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Validates a manual sap reading. `errors` block submission; `warnings` are
 * advisory so an unusual but real reading can still be recorded.
 */
export function validateReading(form) {
  const errors = {};
  const warnings = {};

  if (isBlank(form.NodeID)) {
    errors.NodeID = 'Select the tree this reading came from.';
  }

  const hasWeight = !isBlank(form.Weight);
  const hasSugar = !isBlank(form.Sugar_Percent);

  if (!hasWeight && !hasSugar) {
    errors.Sugar_Percent = 'Enter a sugar percentage, a weight, or both.';
  }

  if (hasSugar) {
    const sugar = asNumber(form.Sugar_Percent);
    if (sugar == null) {
      errors.Sugar_Percent = 'Sugar content must be a number.';
    } else if (sugar < RAW_SAP_MIN_PERCENT || sugar > RAW_SAP_MAX_PERCENT) {
      errors.Sugar_Percent = `Raw sap readings fall between ${RAW_SAP_MIN_PERCENT}% and ${RAW_SAP_MAX_PERCENT}%.`;
    } else if (sugar < RAW_SAP_TYPICAL_MIN || sugar > RAW_SAP_TYPICAL_MAX) {
      warnings.Sugar_Percent = `Outside the typical ${RAW_SAP_TYPICAL_MIN}-${RAW_SAP_TYPICAL_MAX}% band. Double-check the refractometer.`;
    }
  }

  if (hasWeight) {
    const weight = asNumber(form.Weight);
    if (weight == null) {
      errors.Weight = 'Weight must be a number.';
    } else if (weight < 0) {
      errors.Weight = 'Weight cannot be negative.';
    } else if (weight > BUCKET_CAPACITY_LB * 1.5) {
      warnings.Weight = `That exceeds a full bucket (${BUCKET_CAPACITY_LB} lb). Confirm the load cell reading.`;
    }
  }

  if (!isBlank(form.Temperature)) {
    const temperature = asNumber(form.Temperature);
    if (temperature == null) {
      errors.Temperature = 'Temperature must be a number.';
    } else if (temperature < MIN_TEMPERATURE_F || temperature > MAX_TEMPERATURE_F) {
      errors.Temperature = `Enter a temperature between ${MIN_TEMPERATURE_F}F and ${MAX_TEMPERATURE_F}F.`;
    }
  }

  if (isBlank(form.Recorded_At)) {
    errors.Recorded_At = 'A date and time is required.';
  } else if (new Date(form.Recorded_At) > new Date(Date.now() + 60_000)) {
    errors.Recorded_At = 'Readings cannot be dated in the future.';
  }

  return { errors, warnings, isValid: Object.keys(errors).length === 0 };
}

export function validateInvite(form) {
  const errors = {};

  if (isBlank(form.email)) {
    errors.email = 'An email address is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }

  if (isBlank(form.roleId)) {
    errors.roleId = 'Select a role.';
  }

  return { errors, isValid: Object.keys(errors).length === 0 };
}

export function validateSlot(form) {
  const errors = {};

  if (isBlank(form.Task)) errors.Task = 'Select a task.';
  if (isBlank(form.Stand)) errors.Stand = 'Select a stand.';
  if (isBlank(form.Starts_At)) errors.Starts_At = 'A start time is required.';
  if (isBlank(form.Ends_At)) errors.Ends_At = 'An end time is required.';

  if (form.Starts_At && form.Ends_At && new Date(form.Ends_At) <= new Date(form.Starts_At)) {
    errors.Ends_At = 'The shift must end after it starts.';
  }

  const capacity = asNumber(form.Capacity);
  if (capacity == null || capacity < 1) {
    errors.Capacity = 'Capacity must be at least 1.';
  }

  return { errors, isValid: Object.keys(errors).length === 0 };
}

export function validateLogin(form) {
  const errors = {};

  if (isBlank(form.email)) {
    errors.email = 'Enter your RIT email address.';
  }
  if (isBlank(form.password)) {
    errors.password = 'Enter your password.';
  }

  return { errors, isValid: Object.keys(errors).length === 0 };
}
