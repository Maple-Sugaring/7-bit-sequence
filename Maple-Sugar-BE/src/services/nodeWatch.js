/**
 * Marks tracked nodes offline when they stop reporting, and raises one open
 * Node Offline alert so the dashboard warning is not only a status chip.
 */

import { STALE_AFTER_MINUTES } from '../business/thresholds.js';
import { logger } from '../lib/logger.js';
import * as alertsRepository from '../repositories/alertsRepository.js';
import * as nodesRepository from '../repositories/nodesRepository.js';

function watched(node) {
  return node.Tracked && node.Status_Code !== 3;
}

/**
 * Silence shorter than a full outage, plus nodes that have never checked in.
 * A full outage stays Node Offline. Maintenance nodes are left alone.
 */
export function nodeHealthAlerts(nodes, now = new Date()) {
  const alerts = [];

  for (const node of nodes) {
    if (!watched(node)) continue;
    const name = node.Node_Name ?? `Node ${node.NodeID}`;
    const intervalMin = Math.max(1, (node.Report_Interval_Seconds ?? 900) / 60);

    if (!node.Last_Seen) {
      alerts.push({
        NodeID: node.NodeID,
        Alert_Type: 'Node Offline',
        severity: 'critical',
        Status_Code: 0,
        Description: `${name} is tracked but has never reported.`,
      });
      continue;
    }

    const ageMin = (now.getTime() - new Date(node.Last_Seen).getTime()) / 60_000;
    if (ageMin >= STALE_AFTER_MINUTES) {
      alerts.push({
        NodeID: node.NodeID,
        Alert_Type: 'Node Offline',
        severity: 'critical',
        Status_Code: 0,
        Description:
          `${name} has not reported for more than ${STALE_AFTER_MINUTES} minutes. ` +
          `Last seen ${node.Last_Seen}.`,
      });
    } else if (ageMin >= intervalMin * 2) {
      alerts.push({
        NodeID: node.NodeID,
        Alert_Type: 'Missed Readings',
        severity: 'warning',
        Status_Code: 2,
        Description:
          `${name} is late. It should report about every ${Math.round(intervalMin)} minutes ` +
          `and was last seen ${Math.round(ageMin)} minutes ago.`,
      });
    }
  }

  return alerts;
}

export function staleNodeAlerts(nodes, now = new Date()) {
  return nodeHealthAlerts(nodes, now).filter((alert) => alert.Alert_Type === 'Node Offline');
}

export async function watchNodes(now = new Date()) {
  const nodes = await nodesRepository.listNodes();
  const pending = nodeHealthAlerts(nodes, now);
  let raised = 0;

  for (const alert of pending) {
    if (alert.Status_Code != null && alert.Status_Code !== nodes.find((node) => node.NodeID === alert.NodeID)?.Status_Code) {
      await nodesRepository.updateNode(alert.NodeID, { Status_Code: alert.Status_Code });
    }
    if (await alertsRepository.hasOpenAlertOfType(alert.NodeID, alert.Alert_Type)) continue;
    await alertsRepository.createAlert(alert);
    raised += 1;
  }

  if (raised) logger.info({ raised }, 'Raised offline alerts for downed nodes');
  return raised;
}
