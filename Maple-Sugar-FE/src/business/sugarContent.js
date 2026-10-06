/**
 * Sugar content rules (BRU-001, FR-007, FR-031, FR-038).
 *
 * Raw sap runs 1.5-3% sugar. Finished syrup must be boiled to exactly 66.9%,
 * and the system alerts once a batch reaches that mark.
 */

/** Target density for finished product (BRU-001). */
export const FINISHED_SUGAR_PERCENT = 66.9;

/** Plausible range for a raw sap refractometer reading; anything outside is a typo. */
export const RAW_SAP_MIN_PERCENT = 0.5;
export const RAW_SAP_MAX_PERCENT = 12;

/** Typical range, used to warn without blocking submission. */
export const RAW_SAP_TYPICAL_MIN = 1.5;
export const RAW_SAP_TYPICAL_MAX = 3.5;

/**
 * USDA Grade A color classes (FR-038), keyed by light transmittance percent.
 * Transmittance is not measured directly by our sensors, so grading is only
 * available where a batch has a recorded transmittance value.
 */
export const USDA_GRADES = [
  { grade: 'Grade A Golden, Delicate Taste', minTransmittance: 75 },
  { grade: 'Grade A Amber, Rich Taste', minTransmittance: 50 },
  { grade: 'Grade A Dark, Robust Taste', minTransmittance: 25 },
  { grade: 'Grade A Very Dark, Strong Taste', minTransmittance: 0 },
];

export function classifyGrade(transmittancePercent) {
  if (transmittancePercent == null) return null;
  return USDA_GRADES.find((entry) => transmittancePercent >= entry.minTransmittance)?.grade ?? null;
}

/**
 * Rule of 86: gallons of sap needed per gallon of syrup at a given starting
 * sugar percentage. This is what makes a 2.0% run so much cheaper to boil
 * than a 1.5% one, and it is the headline number for the class.
 */
export function sapToSyrupRatio(sugarPercent) {
  if (!sugarPercent || sugarPercent <= 0) return null;
  return 86 / sugarPercent;
}

/** Used until a student records a sugar reading at collection. */
export const DEFAULT_SAP_TO_SYRUP = 40;

/** Gallons of finished syrup from gallons of sap. A sugar reading replaces 40:1. */
export function estimatedSyrupGallons(sapGallons, sugarPercent = null) {
  const sap = Number(sapGallons);
  if (!Number.isFinite(sap) || sap < 0) return null;
  const ratio = sapToSyrupRatio(sugarPercent) ?? DEFAULT_SAP_TO_SYRUP;
  return sap / ratio;
}

/** Sugar percent that would produce this syrup yield from this much sap. */
export function sugarPercentForSyrup(sapGallons, syrupGallons) {
  const sap = Number(sapGallons);
  const syrup = Number(syrupGallons);
  if (!Number.isFinite(sap) || !Number.isFinite(syrup) || sap <= 0 || syrup <= 0) return null;
  return 86 / (sap / syrup);
}

export function isFinished(sugarPercent) {
  return sugarPercent != null && sugarPercent >= FINISHED_SUGAR_PERCENT;
}

/** Categorizes a reading so the UI can color it without duplicating thresholds. */
export function classifyReading(sugarPercent) {
  if (sugarPercent == null) return { level: 'unknown', label: 'Not recorded' };
  if (sugarPercent < RAW_SAP_MIN_PERCENT || sugarPercent > RAW_SAP_MAX_PERCENT) {
    return { level: 'implausible', label: 'Out of range' };
  }
  if (sugarPercent < RAW_SAP_TYPICAL_MIN) return { level: 'low', label: 'Below typical' };
  if (sugarPercent > RAW_SAP_TYPICAL_MAX) return { level: 'high', label: 'Above typical' };
  return { level: 'typical', label: 'Typical' };
}
