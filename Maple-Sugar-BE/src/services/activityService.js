/**
 * Activity recording and the admin trace (FR-036).
 *
 * Recording never fails the operation it describes: a reading is the system of
 * record and a missing trace line is the lesser loss. Failures are logged.
 */

import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import {
  activityCutoff,
  activityDetail,
  ingestDelaySeconds,
  TIMESTAMP_FIELDS,
  toUtcIso,
} from '../business/activity.js';
import { iso } from '../repositories/mappers.js';
import * as activityRepository from '../repositories/activityRepository.js';

/** Request id, receipt time and caller, taken from requestContext. */
export function requestActivity(req) {
  return {
    requestId: req?.id ?? null,
    receivedAt: req?.receivedAt ?? null,
    actorUserId: req?.user?.UserID ?? null,
  };
}

/**
 * Stores one event. `detail` passes through activityDetail, so callers can
 * hand over filters without worrying about what else rode along.
 */
export async function recordActivity(event, client = null) {
  try {
    return await activityRepository.insertActivity(
      { ...event, receivedAt: toUtcIso(event.receivedAt), detail: activityDetail(event.detail) },
      client,
    );
  } catch (error) {
    if (client) throw error;
    logger.error({ err: error, operation: event.operation }, 'Could not record activity');
    return null;
  }
}

/**
 * Runs a background job and records when it ran, how long it took and how it
 * ended. The job's own result is returned unchanged; `describe` picks the
 * fields worth keeping, or null to skip recording an uneventful run.
 */
export async function trackJob(operation, task, describe = () => ({})) {
  const startedAt = new Date();
  const started = performance.now();
  try {
    const result = await task();
    const summary = describe(result);
    // A quiet tick (nothing to replay) is not worth a row every minute.
    if (summary === null) return result;
    await recordActivity({
      kind: 'job',
      operation,
      outcome: summary.outcome ?? 'ok',
      rowCount: summary.rowCount ?? null,
      durationMs: Math.round(performance.now() - started),
      detail: { started_at: startedAt, ...summary.detail },
    });
    return result;
  } catch (error) {
    await recordActivity({
      kind: 'job',
      operation,
      outcome: 'failed',
      durationMs: Math.round(performance.now() - started),
      detail: { started_at: startedAt, error_code: error.code ?? null },
    });
    throw error;
  }
}

export async function listActivity(filters) {
  return activityRepository.listActivity(filters);
}

export function activityPolicy(now = new Date()) {
  const cutoff = activityCutoff(now, config.activityRetentionDays);
  return {
    Retention_Days: config.activityRetentionDays,
    Cutoff: cutoff ? cutoff.toISOString() : null,
    Audit_Trail: 'audit_events is append-only and never pruned.',
    Access: 'Admins (manage_users) only.',
    Stored: 'Ids, counts, filters, outcomes and timestamps. Never request bodies, reading values, notes, or credentials.',
    Storage: 'UTC (timestamptz). Responses are ISO 8601 with Z.',
    Timestamps: TIMESTAMP_FIELDS,
  };
}

/** Deletes activity older than the retention window. Idempotent. */
export async function pruneActivity(now = new Date()) {
  const cutoff = activityCutoff(now, config.activityRetentionDays);
  if (!cutoff) return { Status: 'disabled', Deleted: 0 };
  const deleted = await activityRepository.pruneBefore(cutoff);
  return { Status: 'succeeded', Cutoff: cutoff.toISOString(), Deleted: deleted };
}

/**
 * Everything known about one reading's life: when it was measured, received,
 * stored and corrected, the ingest batch (and replay) that carried it, the reads
 * that returned it, and whether the retention job folded it into an aggregate.
 * Null when there is no trace of the id at all.
 */
export async function traceMetric(metricId) {
  const row = await activityRepository.findMetricTimes(metricId);
  let reading;

  if (row) {
    reading = {
      MetricID: row.id,
      NodeID: row.node_id,
      Status: 'stored',
      Recorded_At: iso(row.recorded_at),
      Received_At: iso(row.received_at),
      Created_At: iso(row.created_at),
      Corrected_At: iso(row.corrected_at),
      Revision: row.revision ?? 0,
      Request_ID: row.request_id ?? null,
      Source: row.recorded_by_user_id == null ? 'sensor' : 'manual',
      Data_Mode: row.data_mode,
    };
  } else {
    const created = await activityRepository.findMetricCreation(metricId);
    if (!created) return null;
    const detail = created.detail ?? {};
    reading = {
      MetricID: metricId,
      NodeID: created.node_id ?? null,
      Status: 'not stored raw',
      Recorded_At: detail.recorded_at ?? null,
      Received_At: iso(created.received_at),
      Created_At: iso(created.occurred_at),
      Corrected_At: null,
      Revision: null,
      Request_ID: created.request_id ?? null,
      Source: detail.source ?? null,
      Data_Mode: created.data_mode,
    };
  }
  reading.Ingest_Delay_Seconds = ingestDelaySeconds(reading.Recorded_At, reading.Received_At);

  let compaction = null;
  if (reading.Status !== 'stored' && reading.NodeID != null && reading.Recorded_At) {
    const aggregate = await activityRepository.findAggregateCovering(reading.NodeID, reading.Recorded_At);
    if (aggregate) {
      reading.Status = 'compacted';
      compaction = {
        AggregateID: aggregate.id,
        Period_Start: iso(aggregate.period_start),
        Period_Seconds: aggregate.period_seconds,
        Sample_Count: aggregate.reading_count,
        Compacted_At: iso(aggregate.updated_at),
        Run_ID: aggregate.last_run_id ?? null,
      };
    } else {
      reading.Status = 'deleted';
    }
  }

  const [activity, audit] = await Promise.all([
    activityRepository.traceMetric({
      metricId,
      nodeId: reading.NodeID,
      recordedAt: reading.Recorded_At,
      createdAt: reading.Created_At,
      requestId: reading.Request_ID,
      runId: compaction?.Run_ID ?? null,
    }),
    activityRepository.listMetricAudit(metricId),
  ]);

  return { Reading: reading, Compaction: compaction, Activity: activity, Audit: audit };
}
