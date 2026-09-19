/**
 * Domain constants, shared with the frontend's business layer.
 *
 * These are physical and regulatory facts about maple sap, not tuning knobs.
 * They appear here because the API enforces them on write; the frontend keeps
 * its own copy to render the same judgements without a round trip. If one
 * changes, both change.
 */

// --- Spoilage (see src/business/spoilage.js in the frontend) ---

/** Microbial growth in raw sap accelerates sharply above this. */
export const SPOILAGE_THRESHOLD_F = 40;
/** Below this, the weather is effectively holding the sap in cold storage. */
export const SAFE_THRESHOLD_F = 34;
/** Sustained exposure beyond this is critical rather than merely elevated. */
export const CRITICAL_EXPOSURE_HOURS = 4;

// --- Sugar content (see src/business/sugarContent.js) ---

/** Sugar concentration at which syrup is finished. */
export const FINISHED_SUGAR_PERCENT = 66.9;
/** Absolute bounds for a believable raw sap refractometer reading. */
export const RAW_SAP_MIN_PERCENT = 0.5;
export const RAW_SAP_MAX_PERCENT = 12;
/** Typical band; outside it the reading is suspect but not rejected. */
export const RAW_SAP_TYPICAL_MIN = 1.5;
export const RAW_SAP_TYPICAL_MAX = 3.5;

// --- Yield (see src/business/yieldMetrics.js) ---

/** Net sap weight a standard bucket holds before it overflows. */
export const BUCKET_CAPACITY_LB = 18;
/** How close to capacity counts as full enough to schedule a collection. */
export const FULL_MARGIN_LB = 1.5;
export const LB_PER_GALLON = 8.6;

// --- Ambient plausibility for a Rochester sap season ---

export const MIN_TEMPERATURE_F = -30;
export const MAX_TEMPERATURE_F = 90;

/** Below this a node's battery warrants a swap. */
export const LOW_BATTERY_PERCENT = 20;
