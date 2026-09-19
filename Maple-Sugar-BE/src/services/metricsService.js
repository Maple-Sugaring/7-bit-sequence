/**
 * Reading orchestration: validation, persistence, derived alerts, and cache
 * invalidation.
 */

import { invalid, notFound } from '../lib/ApiError.js';
import { logger } from '../lib/logger.js';
import { validateReading } from '../business/validation.js';
import { deriveAlerts } from '../business/alerting.js';
import * as metricsRepository from '../repositories/metricsRepository.js';
import * as nodesRepository from '../repositories/nodesRepository.js';
import * as alertsRepository from '../repositories/alertsRepository.js';
import { cacheKeys, cacheNamespaces, hashFilters, TTL } from '../cache/cacheKeys.js';
import { invalidateNamespaces, readThrough } from '../cache/redisCache.js';

export async function listMetrics(filters) {
  // Keyed on the same filter hash the frontend uses, so both tiers cache the
  // same query under the same name.
  return readThrough(cacheKeys.metricsList(hashFilters(filters)), TTL.METRICS, () =>
    metricsRepository.listMetrics(filters),
  );
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

export async function updateMetric(id, changes) {
  const existing = await metricsRepository.findMetricById(id);
  if (!existing) throw notFound('Reading');

  const merged = { ...existing, ...changes };
  const { errors, isValid } = validateReading(merged);
  if (!isValid) throw invalid('Some fields need attention.', errors);

  const updated = await metricsRepository.updateMetric(id, changes);
  await invalidateNamespaces([cacheNamespaces.METRICS, cacheNamespaces.DASHBOARD]);

  return updated;
}
