/**
 * Sensor push from a Raspberry Pi gateway.
 *
 * A reading filed here has no user. `recorded_by_user_id` stays null, which is
 * how a hardware sample is told apart from a manual entry on POST /metrics.
 * The same node and timestamp posted again is the Pi retrying, not a new sample.
 */

import { ApiError, forbidden, invalid, notFound } from '../lib/ApiError.js';
import { validateReading } from '../business/validation.js';
import { alertForFault, clearedAlertTypes } from '../business/alerting.js';
import { ackOutcome, downlinkFor } from '../business/calibration.js';
import { isBeforeCutoff, rawCutoff } from '../business/retention.js';
import { config } from '../config.js';
import { cacheNamespaces } from '../cache/cacheKeys.js';
import { invalidateNamespaces } from '../cache/redisCache.js';
import * as nodesRepository from '../repositories/nodesRepository.js';
import * as metricsRepository from '../repositories/metricsRepository.js';
import * as alertsRepository from '../repositories/alertsRepository.js';
import * as calibrationRepository from '../repositories/calibrationRepository.js';
import * as metricsService from './metricsService.js';
import { logger } from '../lib/logger.js';
import { ingestDelaySeconds, toUtcIso } from '../business/activity.js';
import { recordActivity } from './activityService.js';

function readingIdentity(reading) {
  return {
    NodeID: reading.NodeID ?? null,
    Node_Code: reading.Node_Code ?? null,
    LoRa_Device_ID: reading.LoRa_Device_ID ?? null,
    Recorded_At: reading.Recorded_At ?? null,
  };
}

async function raiseOnce(nodeId, alert) {
  if (!alert) return;
  try {
    if (await alertsRepository.hasOpenAlertOfType(nodeId, alert.Alert_Type)) return;
    await alertsRepository.createAlert({ ...alert, NodeID: nodeId });
    await invalidateNamespaces([cacheNamespaces.ALERTS]);
  } catch (error) {
    logger.error({ err: error, nodeId, type: alert.Alert_Type }, 'Could not raise node alert');
  }
}

/**
 * What the Pi should radio back to this node: the interval the site wants, and
 * any calibration command still waiting. A reading that echoes the open
 * command's id settles it first, so a finished command is not sent again.
 */
async function replyFor(node, reading) {
  let command = await calibrationRepository.findOpenCommand(node.NodeID);
  const outcome = ackOutcome(command, reading);
  if (outcome) {
    await calibrationRepository.settleCommand(command.CommandID, outcome);
    logger.info({ nodeId: node.NodeID, commandId: command.CommandID, ...outcome }, 'Node settled a calibration command');
    command = null;
  }
  const downlink = downlinkFor(command);
  if (downlink && command.Status === 'pending') await calibrationRepository.markSent(command.CommandID);
  return {
    Desired_Interval_Seconds: node.Report_Interval_Seconds ?? null,
    ...(downlink ? { Command: downlink } : {}),
  };
}

async function acceptReading(gateway, reading, context) {
  const node = await nodesRepository.findNodeForIngest(reading);
  if (!node) throw notFound('Node');
  if (node.GatewayID !== gateway.GatewayID) {
    throw forbidden('That node is not on this gateway.');
  }

  if (reading.Fault) {
    await nodesRepository.recordNodeHeartbeat(node.NodeID, {
      batteryPercent: reading.Battery_Percent ?? null,
      signalRssi: reading.Signal_Rssi ?? null,
    });
    const superseded = await alertsRepository.resolveOpenByTypes(node.NodeID, clearedAlertTypes(reading));
    if (superseded) {
      await invalidateNamespaces([cacheNamespaces.ALERTS]);
      logger.info({ nodeId: node.NodeID, superseded, fault: reading.Fault }, 'Cleared older fault alerts');
    }
    await raiseOnce(node.NodeID, alertForFault(reading.Fault, node.Node_Name));
    return { Fault: reading.Fault, Duplicate: false, ...(await replyFor(node, reading)) };
  }

  // Air temperature comes from OpenWeather. A sap probe is a separate field, so
  // a load-cell payload cannot raise a heat alert by sending ambient air.
  const input = {
    ...reading,
    NodeID: node.NodeID,
    BucketID: reading.BucketID,
    Temperature: reading.Sap_Temperature ?? null,
    Sap_Flow_Rate_Lph: reading.Sap_Flow_Rate_Lph ?? null,
  };
  const { errors, isValid } = validateReading(input, { now: context.receivedAt });
  if (!isValid) {
    const message = errors.Weight ?? errors.Recorded_At ?? errors.Sugar_Percent ?? 'Some fields need attention.';
    await raiseOnce(node.NodeID, {
      Alert_Type: 'Incorrect Reading',
      severity: 'warning',
      Description: `${node.Node_Name} sent a reading that was rejected: ${message}`,
    });
    throw invalid(message, errors);
  }

  // The retry check below only sees raw rows. A sample older than the raw
  // retention window may already sit inside an hourly aggregate, where a
  // resend could not be recognised and would be counted twice (BRU-007).
  const cutoff = rawCutoff(new Date(), config.metricsRawRetentionDays);
  if (isBeforeCutoff(reading.Recorded_At, cutoff)) {
    const message = `Readings before ${cutoff.toISOString()} are past the raw retention window and are not accepted.`;
    throw invalid(message, { Recorded_At: message });
  }

  const existing = await metricsRepository.findMetricByNodeAndTime(node.NodeID, reading.Recorded_At);
  if (!existing) {
    input.BucketID = await nodesRepository.findBucketIdForNode(node.NodeID);
  }

  await nodesRepository.recordNodeHeartbeat(node.NodeID, {
    batteryPercent: reading.Battery_Percent ?? null,
    signalRssi: reading.Signal_Rssi ?? null,
  });

  const reply = await replyFor(node, reading);
  if (existing) {
    // A retry. The stored row keeps its first receipt time; this records the
    // later attempt against the same reading (FR-036).
    await recordActivity({
      kind: 'write',
      operation: 'metric.duplicate',
      outcome: 'skipped',
      requestId: context.requestId,
      receivedAt: context.receivedAt,
      gatewayId: gateway.GatewayID,
      entityType: 'metric',
      entityId: existing.MetricID,
      nodeId: node.NodeID,
      detail: {
        source: context.source,
        recorded_at: existing.Recorded_At,
        first_received_at: existing.Received_At,
        retry_received_at: toUtcIso(context.receivedAt),
      },
    });
    return { Reading: existing, Duplicate: true, ...reply };
  }

  const stored = await metricsService.createMetric(input, null, {
    requestId: context.requestId,
    receivedAt: context.receivedAt,
    source: context.source,
    gatewayId: gateway.GatewayID,
  });
  const cleared = await alertsRepository.resolveOpenByTypes(node.NodeID, clearedAlertTypes(reading));
  if (cleared) {
    await invalidateNamespaces([cacheNamespaces.ALERTS]);
    logger.info({ nodeId: node.NodeID, cleared }, 'Cleared node alerts after a good reading');
  }
  return { Reading: stored, Duplicate: false, ...reply };
}

/** Counts, ids and times for the batch's activity row. No reading values. */
function batchSummary(accepted, rejected, context) {
  const stored = accepted.filter((item) => item.Reading);
  const delays = stored
    .map((item) => ingestDelaySeconds(item.Reading.Recorded_At, context.receivedAt))
    .filter((delay) => delay != null);
  const times = stored.map((item) => item.Reading.Recorded_At).sort();
  return {
    source: context.source,
    accepted: accepted.length,
    created: stored.filter((item) => !item.Duplicate).length,
    duplicates: stored.filter((item) => item.Duplicate).length,
    faults: accepted.filter((item) => item.Fault).length,
    rejected: rejected.length,
    rejected_codes: rejected.map((item) => item.code),
    metric_ids: stored.map((item) => item.Reading.MetricID),
    recorded_from: times[0] ?? null,
    recorded_to: times.at(-1) ?? null,
    max_delay_seconds: delays.length ? Math.max(...delays) : null,
  };
}

/**
 * Stores every reading that passes, and reports the ones that do not.
 *
 * One bad node in a batch must not drop the others: the Pi is often forwarding
 * several trees at once, and it will retry the whole body.
 */
/**
 * `receivedAt` is when the API first got the batch and `requestId` the request
 * that carried it. A batch replayed from the local buffer passes both from the
 * original request, so stored readings keep their real receipt time (FR-036).
 */
export async function ingestReadings({
  gatewayCode,
  readings,
  clientIp,
  receivedAt = new Date(),
  requestId = null,
  source = 'gateway',
}) {
  const started = performance.now();
  const context = { receivedAt: new Date(receivedAt), requestId, source };
  if (Number.isNaN(context.receivedAt.getTime())) context.receivedAt = new Date();

  const gateway = await nodesRepository.findGatewayByCode(gatewayCode);
  if (!gateway) {
    await recordActivity({
      kind: 'ingest',
      operation: 'ingest.batch',
      outcome: 'rejected',
      requestId,
      receivedAt: context.receivedAt,
      rowCount: readings.length,
      detail: { source, gateway_code: gatewayCode, reason: 'unknown gateway' },
    });
    throw notFound('Gateway');
  }

  await nodesRepository.touchGateway(gateway.GatewayID, clientIp);

  const accepted = [];
  const rejected = [];

  for (const reading of readings) {
    try {
      accepted.push(await acceptReading(gateway, reading, context));
    } catch (error) {
      if (error instanceof ApiError && error.status < 500) {
        rejected.push({
          ...readingIdentity(reading),
          message: error.message,
          code: error.code,
          details: error.details,
        });
        continue;
      }
      throw error;
    }
  }

  if (accepted.length) {
    await invalidateNamespaces([
      cacheNamespaces.METRICS,
      cacheNamespaces.DASHBOARD,
      cacheNamespaces.NODES,
      cacheNamespaces.GATEWAYS,
    ]);
  } else {
    await invalidateNamespaces([cacheNamespaces.NODES, cacheNamespaces.GATEWAYS]);
  }

  await recordActivity({
    kind: 'ingest',
    operation: 'ingest.batch',
    outcome: !rejected.length ? 'ok' : accepted.length ? 'partial' : 'rejected',
    requestId,
    receivedAt: context.receivedAt,
    gatewayId: gateway.GatewayID,
    entityType: 'gateway',
    entityId: gateway.GatewayID,
    rowCount: readings.length,
    durationMs: Math.round(performance.now() - started),
    detail: batchSummary(accepted, rejected, context),
  });

  return {
    GatewayID: gateway.GatewayID,
    Gateway_Code: gateway.Gateway_Code,
    Accepted: accepted,
    Rejected: rejected,
  };
}
