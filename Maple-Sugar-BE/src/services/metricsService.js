/**
 * Reading orchestration: validation, persistence, derived alerts, and cache
 * invalidation.
 */

import { transaction } from '../db/pool.js';
import { ApiError, invalid, notFound } from '../lib/ApiError.js';
import { logger } from '../lib/logger.js';
import { validateReading } from '../business/validation.js';
import { deriveAlerts } from '../business/alerting.js';
import * as metricsRepository from '../repositories/metricsRepository.js';
import * as metricAggregatesRepository from '../repositories/metricAggregatesRepository.js';
import * as nodesRepository from '../repositories/nodesRepository.js';
import * as alertsRepository from '../repositories/alertsRepository.js';
import { cacheNamespaces } from '../cache/cacheKeys.js';
import { invalidateNamespaces } from '../cache/redisCache.js';

export async function listMetrics(filters) {
  return metricsRepository.listMetrics(filters);
}

/** Weighted per-period averages across raw and compacted readings (BRU-007). */
export async function rollupMetrics(filters) {
  return metricAggregatesRepository.rollup(filters);
}

/**
 * Raises any alerts the new reading implies.
 *
 * Never allowed to fail the write: the reading is the system of record, and
 * losing it because alert generation hit a problem would be a worse outcome than
 * a missing notification.
 */
async function raiseDerivedAlerts(reading, node) {
  try {
    const [history, tareWeight] = await Promise.all([
      metricsRepository.listRecentForNode(reading.NodeID, 24),
      nodesRepository.findTareWeightForNode(reading.NodeID),
    ]);

    const candidates = deriveAlerts({
      reading: { ...reading, Node_Name: node?.Node_Name },
      // The reading itself is already in history, having just been written.
      history: history.filter((row) => row.MetricID !== reading.MetricID),
      tareWeight,
      intervalSeconds: node?.Report_Interval_Seconds,
    });

    if (!candidates.length) return [];

    const created = [];
    for (const candidate of candidates) {
      // Suppress duplicates: a node parked above the threshold would otherwise
      // raise a fresh alert on every reading and bury everything else.
      if (await alertsRepository.hasOpenAlertOfType(reading.NodeID, candidate.Alert_Type)) {
        continue;
      }
      created.push(await alertsRepository.createAlert({ ...candidate, NodeID: reading.NodeID }));
    }

    if (created.length) {
      await invalidateNamespaces([cacheNamespaces.ALERTS]);
      logger.info(
        { nodeId: reading.NodeID, types: created.map((alert) => alert.Alert_Type) },
        'Raised alerts from reading',
      );
    }

    return created;
  } catch (error) {
    logger.error({ err: error, nodeId: reading.NodeID }, 'Alert derivation failed');
    return [];
  }
}

export async function createMetric(input, recordedByUserId) {
  const { errors, isValid } = validateReading(input);
  if (!isValid) {
    // details is field-keyed so the Record Data form can attach each message to
    // its own input rather than showing one banner.
    throw invalid(errors.NodeID ?? 'Some fields need attention.', errors);
  }

  const node = await nodesRepository.findNodeById(input.NodeID);
  if (!node) throw notFound('Node');

  const reading = await metricsRepository.createMetric({
    ...input,
    // Taken from the session, never the body: a client must not be able to file
    // a reading under someone else's name.
    Recorded_By_UserID: recordedByUserId ?? null,
  });

  await invalidateNamespaces([cacheNamespaces.METRICS, cacheNamespaces.DASHBOARD]);
  await raiseDerivedAlerts(reading, node);

  return reading;
}

const CORRECTION_UNITS = { Weight: ' lb', Temperature: ' °F', Sugar_Percent: '%' };

function describeValue(field, value) {
  return value == null ? 'unset' : `${value}${CORRECTION_UNITS[field] ?? ''}`;
}

export async function updateMetric(id, changes, actorId, expectedRevision, reason) {
  const updated = await transaction(async (client) => {
    const existing = await metricsRepository.findMetricById(id, client);
    if (!existing) throw notFound('Reading');
    if (existing.Revision !== expectedRevision) {
      throw new ApiError('The reading has changed. Refresh it and try again.', {
        status: 409,
        code: 'STALE_MEASUREMENT',
      });
    }

    const { errors, isValid } = validateReading({ ...existing, ...changes });
    if (!isValid) throw invalid('Some fields need attention.', errors);

    const differences = Object.entries(changes)
      .filter(([field, value]) => existing[field] !== value)
      .map(([field, value]) => `${field}: ${describeValue(field, existing[field])} → ${describeValue(field, value)}`);
    if (!differences.length) throw invalid('The correction must change the reading.');

    const note = `${differences.join(', ')}. Reason: ${reason}`;
    const reading = await metricsRepository.updateMetric(id, changes, actorId, note, client);
    await client.query(
      "insert into audit_events (event_type, actor_id, target_id, note) values ('measurement_overwritten', $1, $2, $3)",
      [actorId, id, note],
    );
    return reading;
  });
  await invalidateNamespaces([cacheNamespaces.METRICS, cacheNamespaces.DASHBOARD]);

  return updated;
}
