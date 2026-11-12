/**
 * activity_events (FR-036): reads, writes, ingest batches and background jobs,
 * each tied to a request id and, where there is one, an entity.
 */

import { queryAll, queryOne, queryOneOn } from '../db/pool.js';
import { iso } from './mappers.js';

const COLUMNS = `
  id, occurred_at, received_at, request_id, kind, operation, outcome, actor_user_id,
  gateway_id, entity_type, entity_id, node_id, row_count, duration_ms, data_mode, detail
`;

export function mapActivity(row) {
  return {
    ActivityID: row.id,
    Occurred_At: iso(row.occurred_at),
    Received_At: iso(row.received_at),
    Request_ID: row.request_id ?? null,
    Kind: row.kind,
    Operation: row.operation,
    Outcome: row.outcome,
    Actor_UserID: row.actor_user_id ?? null,
    GatewayID: row.gateway_id ?? null,
    Entity_Type: row.entity_type ?? null,
    Entity_ID: row.entity_id ?? null,
    NodeID: row.node_id ?? null,
    Row_Count: row.row_count ?? null,
    Duration_Ms: row.duration_ms ?? null,
    Data_Mode: row.data_mode,
    Detail: row.detail ?? {},
  };
}

/** `client` lets a write and its activity row commit together. */
export async function insertActivity(event, client = null) {
  const row = await queryOneOn(
    client,
    `insert into activity_events (received_at, request_id, kind, operation, outcome, actor_user_id,
                                  gateway_id, entity_type, entity_id, node_id, row_count, duration_ms, detail)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     returning ${COLUMNS}`,
    [
      event.receivedAt ?? null,
      event.requestId ?? null,
      event.kind,
      event.operation,
      event.outcome ?? 'ok',
      event.actorUserId ?? null,
      event.gatewayId ?? null,
      event.entityType ?? null,
      event.entityId ?? null,
      event.nodeId ?? null,
      event.rowCount ?? null,
      event.durationMs ?? null,
      JSON.stringify(event.detail ?? {}),
    ],
  );
  return row ? mapActivity(row) : null;
}

/** Newest first, keyset-paged by id. Every filter is optional. */
export async function listActivity({
  kind,
  operation,
  entityType,
  entityId,
  nodeId,
  requestId,
  actorUserId,
  from,
  to,
  before,
  limit = 50,
} = {}) {
  const conditions = [];
  const values = [];
  const add = (sql, value) => {
    values.push(value);
    conditions.push(sql.replace('?', `$${values.length}`));
  };

  if (kind) add('kind = ?', kind);
  if (operation) add('operation = ?', operation);
  if (entityType) add('entity_type = ?', entityType);
  if (entityId != null) add('entity_id = ?', entityId);
  if (nodeId != null) add('node_id = ?', nodeId);
  if (requestId) add('request_id = ?', requestId);
  if (actorUserId != null) add('actor_user_id = ?', actorUserId);
  if (from) add('occurred_at >= ?::timestamptz', from);
  if (to) add('occurred_at <= ?::timestamptz', to);
  if (before != null) add('id < ?', before);

  values.push(limit + 1);
  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
  const rows = await queryAll(
    `select ${COLUMNS} from activity_events ${where} order by id desc limit $${values.length}`,
    values,
  );
  const items = rows.slice(0, limit).map(mapActivity);
  return { items, next: rows.length > limit ? items.at(-1).ActivityID : null };
}

/** The reading's own timestamps, whatever the current data mode. */
export async function findMetricTimes(metricId) {
  return queryOne(
    `select id, node_id, recorded_at, received_at, created_at, corrected_at, revision, request_id,
            recorded_by_user_id, data_mode
       from metrics where id = $1`,
    [metricId],
  );
}

/** What the create event remembered, for a reading that was since compacted. */
export async function findMetricCreation(metricId) {
  return queryOne(
    `select ${COLUMNS} from activity_events
      where entity_type = 'metric' and entity_id = $1 and operation = 'metric.create'
      order by id limit 1`,
    [metricId],
  );
}

export async function findAggregateCovering(nodeId, recordedAt) {
  return queryOne(
    `select id, period_start, period_seconds, reading_count, updated_at, last_run_id, data_mode
       from metric_aggregates
      where node_id = $1
        and period_start <= $2::timestamptz
        and $2::timestamptz < period_start + make_interval(secs => period_seconds)
      order by updated_at desc limit 1`,
    [nodeId, recordedAt],
  );
}

/**
 * Every activity event tied to one reading:
 *   - events naming it (create, duplicate retry, correction, trace)
 *   - events that name it in detail (alerts derived from it)
 *   - the ingest batch that carried it, and any buffer replay of that batch
 *   - list reads whose result included it (see summarizeRead)
 *   - a retention run whose window covered it
 */
export async function traceMetric({ metricId, nodeId, recordedAt, createdAt, requestId, runId }) {
  const rows = await queryAll(
    `select ${COLUMNS} from activity_events
      where (entity_type = 'metric' and entity_id = $1)
         or (detail ->> 'metric_id') = $1::text
         or ($4::text is not null and request_id = $4 and kind = 'ingest')
         or ($2::integer is not null and $3::timestamptz is not null
             and kind = 'read' and operation = 'metrics.list'
             and detail -> 'node_ids' @> to_jsonb($2::integer)
             and (detail ->> 'recorded_from')::timestamptz <= $3::timestamptz
             and (detail ->> 'recorded_to')::timestamptz >= $3::timestamptz
             and ($5::timestamptz is null or occurred_at >= $5::timestamptz))
         or ($6::bigint is not null and operation = 'retention.run' and (detail ->> 'run_id')::bigint = $6)
      order by occurred_at, id
      limit 500`,
    [metricId, nodeId ?? null, recordedAt ?? null, requestId ?? null, createdAt ?? null, runId ?? null],
  );
  return rows.map(mapActivity);
}

export async function listMetricAudit(metricId) {
  const rows = await queryAll(
    `select id, event_type, actor_id, target_id, note, created_at
       from audit_events
      where target_id = $1 and event_type = 'measurement_overwritten'
      order by id`,
    [metricId],
  );
  return rows.map((row) => ({ ...row, created_at: iso(row.created_at) }));
}

export async function pruneBefore(cutoff) {
  const row = await queryOne(
    `with gone as (delete from activity_events where occurred_at < $1 returning 1)
     select count(*) as count from gone`,
    [cutoff],
  );
  return row?.count ?? 0;
}
