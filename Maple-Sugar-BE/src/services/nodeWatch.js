/**
 * Marks tracked nodes offline when they stop reporting, and raises one open
 * Node Offline alert so the dashboard warning is not only a status chip.
 */

import { STALE_AFTER_MINUTES } from '../business/thresholds.js';
import { logger } from '../lib/logger.js';
import * as alertsRepository from '../repositories/alertsRepository.js';
import * as nodesRepository from '../repositories/nodesRepository.js';

export function staleNodeAlerts(nodes, now = new Date()) {
  const cutoff = now.getTime() - STALE_AFTER_MINUTES * 60_000;

  return nodes
    .filter((node) => node.Tracked && node.Status_Code !== 3 && node.Last_Seen)
    .filter((node) => new Date(node.Last_Seen).getTime() < cutoff)
    .map((node) => ({
      NodeID: node.NodeID,
      Alert_Type: 'Node Offline',
      severity: 'critical',
      Description:
        `${node.Node_Name ?? `Node ${node.NodeID}`} has not reported for more than ` +
        `${STALE_AFTER_MINUTES} minutes. Last seen ${node.Last_Seen}.`,
    }));
}

export async function watchNodes(now = new Date()) {
  const nodes = await nodesRepository.listNodes();
  const stale = staleNodeAlerts(nodes, now);
  let raised = 0;

  for (const alert of stale) {
    await nodesRepository.updateNode(alert.NodeID, { Status_Code: 0 });
    if (await alertsRepository.hasOpenAlertOfType(alert.NodeID, alert.Alert_Type)) continue;
    await alertsRepository.createAlert(alert);
    raised += 1;
  }

  if (raised) logger.info({ raised }, 'Raised offline alerts for downed nodes');
  return raised;
}
