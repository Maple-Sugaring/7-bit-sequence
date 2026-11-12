/**
 * Timestamp meanings and activity-record rules (FR-036).
 *
 * Every instant is stored as timestamptz and returned as UTC ISO 8601. Each
 * name below means one thing and is never reused for another:
 *
 *   Recorded_At   when the node (or person) measured. Supplied by the client,
 *                 kept through retries, buffering and replay.
 *   Received_At   when this API first received the request that carried the
 *                 data. A buffered batch keeps its original receipt time.
 *   Created_At    when Postgres wrote the row.
 *   Corrected_At  when a person last corrected the row.
 *   Occurred_At   when an activity event (read, write, ingest, job) happened.
 *
 * Pure so the rules can be tested without a database.
 */

export const TIMESTAMP_FIELDS = {
  Recorded_At: 'Measurement time, from the node or the person entering it. Preserved through retries and delayed ingestion.',
  Received_At: 'When the API first received the request carrying the data. Buffered batches keep the original receipt time.',
  Created_At: 'When the database stored the row.',
  Corrected_At: 'When a person last corrected the row (PATCH /metrics/:id).',
  Occurred_At: 'When an activity event happened: a read, a write, an ingest batch, or a background job.',
};

export const ACTIVITY_KINDS = ['read', 'write', 'ingest', 'job'];
export const ACTIVITY_OUTCOMES = ['ok', 'partial', 'rejected', 'failed', 'skipped'];

export const DEFAULT_ACTIVITY_RETENTION_DAYS = 90;
/** Shorter than this and a weekend bug report would find nothing to trace. */
export const MIN_ACTIVITY_RETENTION_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_STRING = 200;
const MAX_ARRAY = 50;

// Detail is for tracing, not for copying data. Anything that could carry a
// credential or a person's details is dropped by key, whatever its value.
const SENSITIVE_KEY = /pass|secret|token|cookie|auth|session|email|phone|note|reason|body|payload/i;

/**
 * A timestamp a client sends must name its offset ("Z" or "+hh:mm"). Without
 * one, JavaScript and Postgres would each read it in their own local zone and
 * could store two different instants for the same text.
 */
const EXPLICIT_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/i;

export function hasExplicitOffset(value) {
  return typeof value === 'string' && EXPLICIT_OFFSET.test(value) && !Number.isNaN(Date.parse(value));
}

/** ISO string in UTC, or null for anything that is not a real instant. */
export function toUtcIso(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Seconds between measurement and receipt. Positive is a delayed upload; a
 * small negative number is a node clock running ahead.
 */
export function ingestDelaySeconds(recordedAt, receivedAt) {
  // new Date(null) is the epoch, which would read as a 56-year delay.
  if (recordedAt == null || receivedAt == null) return null;
  const recorded = new Date(recordedAt).getTime();
  const received = new Date(receivedAt).getTime();
  if (!Number.isFinite(recorded) || !Number.isFinite(received)) return null;
  return Math.round((received - recorded) / 1000);
}

/** Correlation ids a caller may supply. Anything else gets a fresh one. */
const REQUEST_ID = /^[A-Za-z0-9._:-]{8,64}$/;

export function acceptRequestId(value) {
  return typeof value === 'string' && REQUEST_ID.test(value) ? value : null;
}

function cleanValue(value, depth) {
  if (value == null) return null;
  if (value instanceof Date) return toUtcIso(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (Array.isArray(value)) {
    if (depth > 1) return undefined;
    return value.slice(0, MAX_ARRAY).map((item) => cleanValue(item, depth + 1)).filter((item) => item !== undefined);
  }
  if (typeof value === 'object') {
    if (depth > 1) return undefined;
    return activityDetail(value, depth + 1);
  }
  return undefined;
}

/**
 * Detail safe to store on an activity event: ids, counts, filters and times.
 * Sensitive keys are dropped, strings and arrays are capped, and nesting stops
 * at two levels so a whole request body cannot slip in.
 */
export function activityDetail(input, depth = 0) {
  const detail = {};
  if (!input || typeof input !== 'object') return detail;
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY.test(key)) continue;
    const cleaned = cleanValue(value, depth);
    if (cleaned !== undefined) detail[key] = cleaned;
  }
  return detail;
}

/** Activity strictly before this instant may be pruned. Null keeps everything. */
export function activityCutoff(now, retentionDays) {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return null;
  return new Date(new Date(now).getTime() - retentionDays * DAY_MS);
}

/**
 * What a list read returned, in a form the trace can match later: which nodes
 * and the measurement range. A reading was in the result when its node is
 * listed, its Recorded_At is inside the range, and it existed at read time.
 * The filters are the same for every node, so that is exact for raw rows.
 */
export function summarizeRead(rows) {
  const nodeIds = new Set();
  let first = null;
  let last = null;
  for (const row of rows) {
    if (row.NodeID != null) nodeIds.add(row.NodeID);
    const at = row.Recorded_At;
    if (!at) continue;
    if (first == null || at < first) first = at;
    if (last == null || at > last) last = at;
  }
  const ids = [...nodeIds].sort((a, b) => a - b);
  return {
    node_ids: ids.slice(0, MAX_ARRAY),
    node_ids_truncated: ids.length > MAX_ARRAY,
    recorded_from: first,
    recorded_to: last,
  };
}
