/**
 * Sugar content rules (BRU-001, FR-007, FR-031, FR-038).
 *
 * Sugar is only recorded when a student tests the sap, so every estimate here
 * has to work without it and say what it used instead.
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
 * Frozen sap sheds its water as ice, so the liquid left in an iced bucket reads
 * much sweeter. The sponsor sees 2% climb to 10% there, which is expected.
 */
export const RAW_SAP_ICE_TYPICAL_MAX = 10;

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
export const RULE_OF_86 = 86;

export function sapToSyrupRatio(sugarPercent) {
  if (!sugarPercent || sugarPercent <= 0) return null;
  return RULE_OF_86 / sugarPercent;
}

/**
 * Gallons of sap per gallon of syrup when no sugar reading is available.
 *
 * The sponsor's own yield is 43 gallons of sap to 1 of syrup, which is the
 * Rule of 86 at 2.0% sugar. It used to be 40:1, which assumed 2.15% sugar and
 * ran every untested estimate about 7% high.
 */
export const DEFAULT_SAP_TO_SYRUP = 43;

/** Gallons of finished syrup from gallons of sap. A sugar reading replaces 43:1. */
export function estimatedSyrupGallons(sapGallons, sugarPercent = null) {
  const sap = Number(sapGallons);
  if (!Number.isFinite(sap) || sap < 0) return null;
  const ratio = sapToSyrupRatio(sugarPercent) ?? DEFAULT_SAP_TO_SYRUP;
  return sap / ratio;
}

/**
 * Where an estimate's sugar percent came from. Sugar is only known when a
 * student tests the sap, so most collections have none of their own, and the
 * estimate has to say what it leaned on instead.
 */
export const SugarBasis = {
  /** Tested on this collection. */
  TESTED: 'tested',
  /** This tree's last test this sap season. */
  TREE: 'tree',
  /** Average of the trees tested this sap season. */
  BUSH: 'bush',
  /** Nothing tested yet; the sponsor's 43:1. */
  DEFAULT: 'default',
};

function usableSugar(value) {
  if (value == null || value === '') return null;
  const percent = Number(value);
  return Number.isFinite(percent) && percent > 0 ? percent : null;
}

/**
 * The sugar percent an estimate should use, best evidence first: this
 * collection's own test, then this tree's last test, then the bush average,
 * then no percent at all (the default ratio). A tree's own recent sugar is a
 * better guess for its next bucket than the bush as a whole, and either beats
 * a fixed ratio.
 */
export function sugarForEstimate({ tested = null, tree = null, bush = null } = {}) {
  const own = usableSugar(tested);
  if (own != null) return { percent: own, basis: SugarBasis.TESTED };
  const treeLast = usableSugar(tree);
  if (treeLast != null) return { percent: treeLast, basis: SugarBasis.TREE };
  const bushAverage = usableSugar(bush);
  if (bushAverage != null) return { percent: bushAverage, basis: SugarBasis.BUSH };
  return { percent: null, basis: SugarBasis.DEFAULT };
}

/** Mean of the sugar readings in a set of rows, ignoring untested ones. */
export function bushAverageSugar(rows) {
  const values = (rows ?? []).map((row) => usableSugar(row?.Sugar_Percent)).filter((value) => value != null);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Syrup expected from some sap, with the evidence behind it.
 *
 * `approximate` is set when the bucket holds ice and the sugar came from a
 * test on it. A refractometer reads only the liquid, and that liquid is sweeter
 * than the bucket as a whole, so the estimate runs high. It is flagged rather
 * than corrected because the liquid share is not measured.
 */
export function syrupEstimate({ sapGallons, tested = null, tree = null, bush = null, ice = false } = {}) {
  const sap = Number(sapGallons);
  if (sapGallons == null || !Number.isFinite(sap) || sap < 0) return null;

  const { percent, basis } = sugarForEstimate({ tested, tree, bush });
  const ratio = sapToSyrupRatio(percent) ?? DEFAULT_SAP_TO_SYRUP;
  return {
    sapGallons: sap,
    syrupGallons: sap / ratio,
    ratio,
    percent,
    basis,
    approximate: Boolean(ice) && basis === SugarBasis.TESTED,
  };
}

/** Plain-words source for an estimate, for the line under the number. */
export function basisLabel({ basis, percent, ratio } = {}) {
  const pct = percent == null ? '' : `${Number(percent).toFixed(1)}%`;
  if (basis === SugarBasis.TESTED) return `your ${pct} test`;
  if (basis === SugarBasis.TREE) return `this tree's last test, ${pct}`;
  if (basis === SugarBasis.BUSH) return `the ${pct} average of trees tested this season`;
  return `${Math.round(ratio ?? DEFAULT_SAP_TO_SYRUP)}:1, since nothing is tested yet`;
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
