/**
 * Shelf life estimation for raw sap (FR-016).
 *
 * Raw sap is perishable. Its usable window collapses as temperature rises,
 * roughly halving for every 10F above freezing, and higher sugar content gives
 * bacteria more to work with.
 *
 * The clock belongs to a batch, meaning the sap in one physical bucket since
 * it was last emptied. It does not belong to a tree: buckets are swapped and
 * carried between trees, and an empty bucket on a tree has nothing to spoil.
 */

import { SPOILAGE_THRESHOLD_F } from './spoilage';

/** Hours a bucket of sap stays usable when held at or below freezing. */
export const BASE_SHELF_LIFE_HOURS = 96;
/** Each 10F above freezing roughly halves the remaining window. */
const HALVING_INTERVAL_F = 10;
const FREEZING_F = 32;

/**
 * Total usable window for sap held at a given temperature.
 * Returns hours from the moment the sap entered the bucket.
 */
export function shelfLifeHours(temperatureF, sugarPercent = null) {
  if (temperatureF == null) return null;

  const degreesAboveFreezing = Math.max(0, temperatureF - FREEZING_F);
  const halvings = degreesAboveFreezing / HALVING_INTERVAL_F;
  let hours = BASE_SHELF_LIFE_HOURS / 2 ** halvings;

  // Sugar is bacterial feedstock at raw-sap concentrations. Above the typical
  // band, discount the window further.
  if (sugarPercent != null && sugarPercent > 3) {
    hours *= 1 - Math.min(0.3, (sugarPercent - 3) * 0.1);
  }

  return Math.max(0, hours);
}

/** Net sap at or below this is an empty bucket, which absorbs load-cell noise. */
const EMPTY_NET_LB = 1;
/** A sap temperature reading speaks for the bucket this long, then air takes over. */
const SAP_TEMP_VALID_HOURS = 6;
/** Bucket states that mean the bucket is off the tree and holds no live sap. */
const INACTIVE_STATUSES = new Set(['Storage', 'Cleaning']);

const HOUR_MS = 3_600_000;

function emptyBatch(bucket) {
  return {
    state: 'empty',
    bucketId: bucket.BucketID,
    barcode: bucket.Barcode_ID ?? null,
    nodeId: null,
    startedAt: null,
    ageHours: null,
    hours: null,
    label: 'No sap',
    severity: 'info',
    source: null,
  };
}

function timeOf(value) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Shelf life for the sap currently in one bucket.
 *
 * Spoilage is accumulated, not looked up. Every stretch of the batch's life
 * uses up a fraction of the window that applied at that temperature, so a warm
 * afternoon costs more than a cold night and a freeze does not wipe the slate.
 * What is left is the unused fraction of the window at today's temperature.
 *
 * Temperature comes from a sap probe reading while one is fresh, and from the
 * air otherwise. The air value is only known as of now, so it is charged to the
 * whole unprobed stretch; `source` says how much of the answer is measured.
 *
 * `asOf` defaults to the newest reading so a finished season reports how its
 * buckets stood then instead of calling everything expired.
 */
export function bucketBatch({ bucket, readings, collections = [], ambientF = null, now }) {
  if (INACTIVE_STATUSES.has(bucket.Status)) return emptyBatch(bucket);

  const tare = bucket.Tare_Weight ?? 0;
  const rows = (readings ?? [])
    .filter((row) => row.BucketID === bucket.BucketID && row.Weight != null && timeOf(row.Recorded_At) != null)
    .map((row) => ({ row, time: timeOf(row.Recorded_At), net: Math.max(0, row.Weight - tare) }))
    .sort((a, b) => a.time - b.time);
  if (rows.length === 0) return emptyBatch(bucket);

  const asOf = now ? new Date(now).getTime() : rows[rows.length - 1].time;
  const known = rows.filter((entry) => entry.time <= asOf);

  let emptiedAt = -Infinity;
  for (const entry of known) {
    if (entry.net <= EMPTY_NET_LB) emptiedAt = entry.time;
  }
  for (const log of collections) {
    const collectedAt = timeOf(log.Collected_At);
    if (log.BucketID === bucket.BucketID && collectedAt != null && collectedAt <= asOf) {
      emptiedAt = Math.max(emptiedAt, collectedAt);
    }
  }

  const batch = known.filter((entry) => entry.time > emptiedAt && entry.net > EMPTY_NET_LB);
  if (batch.length === 0) return emptyBatch(bucket);

  const sugar = batch
    .map((entry) => entry.row.Sugar_Percent)
    .filter((value) => value != null)
    .at(-1) ?? null;

  const startedAt = batch[0].time;
  const result = {
    bucketId: bucket.BucketID,
    barcode: bucket.Barcode_ID ?? null,
    nodeId: batch[batch.length - 1].row.NodeID ?? null,
    startedAt: new Date(startedAt).toISOString(),
    ageHours: (asOf - startedAt) / HOUR_MS,
    asOf: new Date(asOf).toISOString(),
    gallons: batch[batch.length - 1].net / 8.34,
  };

  // Walk the batch, splitting each gap into the part a probe reading still
  // covers and the part left to the air.
  const probes = batch.filter((entry) => entry.row.Temperature != null);
  const probeAt = (time) => probes.findLast((entry) => entry.time <= time) ?? null;

  let used = 0;
  let probeHours = 0;
  let airHours = 0;
  let unmeasured = false;
  let worst = -Infinity;

  for (let index = 0; index < batch.length; index += 1) {
    const start = batch[index].time;
    const end = index + 1 < batch.length ? batch[index + 1].time : asOf;
    const span = (end - start) / HOUR_MS;
    if (span <= 0) continue;

    const probe = probeAt(start);
    const covered = probe ? Math.min(span, Math.max(0, SAP_TEMP_VALID_HOURS - (start - probe.time) / HOUR_MS)) : 0;
    const open = span - covered;

    if (covered > 0) {
      used += covered / shelfLifeHours(probe.row.Temperature, sugar);
      probeHours += covered;
      worst = Math.max(worst, probe.row.Temperature);
    }
    if (open > 0) {
      if (ambientF == null) {
        unmeasured = true;
      } else {
        used += open / shelfLifeHours(ambientF, sugar);
        airHours += open;
        worst = Math.max(worst, ambientF);
      }
    }
  }

  const latestProbe = probeAt(asOf);
  const probeIsFresh = latestProbe != null && (asOf - latestProbe.time) / HOUR_MS <= SAP_TEMP_VALID_HOURS;
  const currentF = probeIsFresh ? latestProbe.row.Temperature : ambientF;

  if (currentF == null || unmeasured) {
    return { ...result, state: 'unknown', hours: null, label: formatShelfLife(null), severity: 'info', source: null };
  }

  if (probeIsFresh) worst = Math.max(worst, currentF);
  // A batch with no elapsed time has no stretch to attribute; name the source
  // of the temperature the projection uses instead.
  const usedProbe = probeHours > 0 || (airHours === 0 && probeIsFresh);
  const usedAir = airHours > 0 || (probeHours === 0 && !probeIsFresh);

  const hours = Math.max(0, 1 - used) * shelfLifeHours(currentF, sugar);

  return {
    ...result,
    state: 'active',
    hours,
    label: formatShelfLife(hours),
    severity: shelfLifeSeverity(hours),
    source: usedProbe && usedAir ? 'sap and air temperature' : usedProbe ? 'sap temperature' : 'air temperature',
    temperatureF: currentF,
    worstTemperature: worst,
    exceededThreshold: worst > SPOILAGE_THRESHOLD_F,
  };
}

/** A batch for every bucket, keyed by BucketID. */
export function shelfLifeByBucket({ readings, buckets, collections = [], ambientF = null, now }) {
  return new Map(
    (buckets ?? []).map((bucket) => [bucket.BucketID, bucketBatch({ bucket, readings, collections, ambientF, now })]),
  );
}

/** The batch closest to spoiling, ignoring buckets that have nothing to time. */
export function shortestBatch(batches) {
  return [...batches].reduce((soonest, batch) => {
    if (batch.hours == null) return soonest;
    return !soonest || batch.hours < soonest.hours ? batch : soonest;
  }, null);
}

export function formatShelfLife(hours) {
  if (hours == null) return 'Unknown';
  if (hours <= 0) return 'Expired';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} hr`;
  return `${(hours / 24).toFixed(1)} days`;
}

/** Severity token for coloring a shelf-life readout. */
export function shelfLifeSeverity(hours) {
  if (hours == null) return 'info';
  if (hours <= 0) return 'error';
  if (hours < 12) return 'error';
  if (hours < 24) return 'warning';
  return 'success';
}
