import dayjs from 'dayjs';
import * as bucketsRepository from '../data/repositories/bucketsRepository';
import * as nodesRepository from '../data/repositories/nodesRepository';
import { NODE_STATUS } from '../data/fixtures/seed';

/**
 * Device health (EIR-005, EIR-008, FR-012, FR-047).
 *
 * Battery, signal strength, and last-seen per node, plus the geo coordinates
 * the map view plots.
 */

export function getBoard() {
  return nodesRepository.listBoard();
}

export function runNodeAction(nodeId, body) {
  return nodesRepository.runNodeAction(nodeId, body);
}

/** RSSI above this is a healthy LoRa link; below the lower bound is failing. */
export const RSSI_GOOD = -95;
export const RSSI_POOR = -115;

export const BATTERY_LOW_PERCENT = 20;
export const BATTERY_CRITICAL_PERCENT = 10;

/** A node that has not reported in this long is treated as stale. */
export const STALE_AFTER_MINUTES = 45;

export function batterySeverity(percent) {
  if (percent == null) return 'info';
  if (percent < BATTERY_CRITICAL_PERCENT) return 'error';
  if (percent < BATTERY_LOW_PERCENT) return 'warning';
  return 'success';
}

export function signalSeverity(rssi) {
  if (rssi == null) return 'info';
  if (rssi < RSSI_POOR) return 'error';
  if (rssi < RSSI_GOOD) return 'warning';
  return 'success';
}

export function statusSeverity(statusCode) {
  return { 0: 'error', 1: 'success', 2: 'warning', 3: 'info' }[statusCode] ?? 'info';
}

export async function getDeviceHealth() {
  const [nodes, gateways, buckets] = await Promise.all([
    nodesRepository.listNodes(),
    nodesRepository.listGateways(),
    bucketsRepository.listBuckets(),
  ]);

  const gatewayById = new Map(gateways.map((gateway) => [gateway.GatewayID, gateway]));

  const rows = nodes.map((node) => {
    const gateway = gatewayById.get(node.GatewayID);
    const bucket = buckets.find((candidate) => candidate.NodeID === node.NodeID);
    const minutesSinceSeen = dayjs().diff(dayjs(node.Last_Seen), 'minute');

    return {
      ...node,
      id: node.NodeID,
      statusLabel: NODE_STATUS[node.Status_Code] ?? 'Unknown',
      statusSeverity: statusSeverity(node.Status_Code),
      batterySeverity: batterySeverity(node.Battery_Percent),
      signalSeverity: signalSeverity(node.Signal_Rssi),
      gatewayName: gateway?.Gateway_Name ?? `Gateway ${node.GatewayID}`,
      gatewayStatus: gateway?.Status ?? 'Unknown',
      bucketBarcode: bucket?.Barcode_ID ?? null,
      minutesSinceSeen,
      isStale: minutesSinceSeen > STALE_AFTER_MINUTES,
      latitude: node.Location?.lat ?? null,
      longitude: node.Location?.lon ?? null,
    };
  });

  return {
    nodes: rows.sort((a, b) => a.Node_Name.localeCompare(b.Node_Name)),
    gateways: gateways.map((gateway) => ({
      ...gateway,
      minutesSinceSeen: dayjs().diff(dayjs(gateway.Last_Seen), 'minute'),
    })),
    summary: {
      total: rows.length,
      online: rows.filter((row) => row.Status_Code === 1).length,
      degraded: rows.filter((row) => row.Status_Code === 2).length,
      offline: rows.filter((row) => row.Status_Code === 0).length,
      lowBattery: rows.filter((row) => row.batterySeverity !== 'success').length,
      poorSignal: rows.filter((row) => row.signalSeverity !== 'success').length,
    },
  };
}

export function setMaintenanceMode(nodeId, enabled) {
  return nodesRepository.updateNode(nodeId, { Status_Code: enabled ? 3 : 1 });
}
