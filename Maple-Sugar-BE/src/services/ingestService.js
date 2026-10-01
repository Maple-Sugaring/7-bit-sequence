/**
 * Sensor push from a Raspberry Pi gateway.
 *
 * A reading filed here has no user. `recorded_by_user_id` stays null, which is
 * how a hardware sample is told apart from a manual entry on POST /metrics.
 * The same node and timestamp posted again is the Pi retrying, not a new sample.
 */

import { ApiError, forbidden, invalid, notFound } from '../lib/ApiError.js';
import { validateReading } from '../business/validation.js';
import { cacheNamespaces } from '../cache/cacheKeys.js';
import { invalidateNamespaces } from '../cache/redisCache.js';
import * as nodesRepository from '../repositories/nodesRepository.js';
import * as metricsRepository from '../repositories/metricsRepository.js';
import * as metricsService from './metricsService.js';

function readingIdentity(reading) {
  return {
    NodeID: reading.NodeID ?? null,
    Node_Code: reading.Node_Code ?? null,
    LoRa_Device_ID: reading.LoRa_Device_ID ?? null,
    Recorded_At: reading.Recorded_At ?? null,
  };
}

async function acceptReading(gateway, reading) {
  const node = await nodesRepository.findNodeForIngest(reading);
  if (!node) throw notFound('Node');
  if (node.GatewayID !== gateway.GatewayID) {
    throw forbidden('That node is not on this gateway.');
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
  const { errors, isValid } = validateReading(input);
  if (!isValid) {
    const message = errors.Weight ?? errors.Recorded_At ?? errors.Sugar_Percent ?? 'Some fields need attention.';
    throw invalid(message, errors);
  }

  const existing = await metricsRepository.findMetricByNodeAndTime(node.NodeID, reading.Recorded_At);
  if (!existing) {
    input.BucketID = await nodesRepository.findBucketIdForNode(node.NodeID);
  }

  await nodesRepository.recordNodeHeartbeat(node.NodeID, {
    batteryPercent: reading.Battery_Percent ?? null,
    signalRssi: reading.Signal_Rssi ?? null,
  });

  const desired = node.Report_Interval_Seconds ?? null;
  if (existing) return { Reading: existing, Duplicate: true, Desired_Interval_Seconds: desired };

  const stored = await metricsService.createMetric(input, null);
  return { Reading: stored, Duplicate: false, Desired_Interval_Seconds: desired };
}

/**
 * Stores every reading that passes, and reports the ones that do not.
 *
 * One bad node in a batch must not drop the others: the Pi is often forwarding
 * several trees at once, and it will retry the whole body.
 */
export async function ingestReadings({ gatewayCode, readings, clientIp }) {
  const gateway = await nodesRepository.findGatewayByCode(gatewayCode);
  if (!gateway) throw notFound('Gateway');

  await nodesRepository.touchGateway(gateway.GatewayID, clientIp);

  const accepted = [];
  const rejected = [];

  for (const reading of readings) {
    try {
      accepted.push(await acceptReading(gateway, reading));
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

  return {
    GatewayID: gateway.GatewayID,
    Gateway_Code: gateway.Gateway_Code,
    Accepted: accepted,
    Rejected: rejected,
  };
}
