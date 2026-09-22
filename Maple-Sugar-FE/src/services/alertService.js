import dayjs from 'dayjs';
import * as alertsRepository from '../data/repositories/alertsRepository';
import * as nodesRepository from '../data/repositories/nodesRepository';

/**
 * Alert orchestration (EIR-002, FR-006, FR-019, FR-043).
 *
 * Assigns a severity to each alert type and flags anything an unresolved
 * alert has outlived, which is the escalation rule in FR-043.
 */

/** Minutes before an unacknowledged alert is escalated to an admin (FR-043). */
export const ESCALATION_MINUTES = 30;

const SEVERITY_BY_TYPE = {
  Spoilage: 'error',
  Tipped: 'error',
  'Node Offline': 'error',
  'Full Bucket': 'warning',
  'Collection Needed': 'warning',
  'Sap Run': 'info',
  'Extreme Cold': 'error',
  'Hard Freeze': 'warning',
  'High Wind': 'warning',
  'Heavy Precipitation': 'warning',
  'Ice Storm': 'error',
  Spill: 'error',
  Freezing: 'warning',
  'Low Battery': 'warning',
  'Signal Loss': 'info',
  Flagged: 'info',
};

/** Sort weight so the most urgent alerts surface first. */
const SEVERITY_RANK = { error: 0, warning: 1, info: 2, success: 3 };

export function severityOf(alertType) {
  return SEVERITY_BY_TYPE[alertType] ?? 'info';
}

function enrich(alert, nodeById) {
  const node = nodeById.get(alert.NodeID);
  const ageMinutes = dayjs().diff(dayjs(alert.Created_At), 'minute');

  return {
    ...alert,
    id: alert.AlertID,
    nodeName: alert.NodeID == null ? 'Sugarbush' : (node?.Node_Name ?? `Node ${alert.NodeID}`),
    stand: node?.Stand ?? null,
    severity: severityOf(alert.Alert_Type),
    ageMinutes,
    // FR-043: unacknowledged past the window, so an admin needs to see it.
    isEscalated: !alert.Is_Resolved && ageMinutes >= ESCALATION_MINUTES,
  };
}

export async function getAlerts() {
  const [alerts, nodes] = await Promise.all([
    alertsRepository.listAlerts(),
    nodesRepository.listNodes(),
  ]);

  const nodeById = new Map(nodes.map((node) => [node.NodeID, node]));

  return alerts
    .map((alert) => enrich(alert, nodeById))
    .sort((a, b) => {
      if (a.Is_Resolved !== b.Is_Resolved) return a.Is_Resolved ? 1 : -1;
      const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (bySeverity !== 0) return bySeverity;
      return new Date(b.Created_At) - new Date(a.Created_At);
    });
}

/** Count for the notification badge. */
export async function getOpenAlertCount() {
  const open = await alertsRepository.listOpenAlerts();
  return open.length;
}

export function resolveAlert(alertId) {
  return alertsRepository.setAlertResolved(alertId, true);
}

export function reopenAlert(alertId) {
  return alertsRepository.setAlertResolved(alertId, false);
}

/** FR-047: raise an alert against a node from the device health screen. */
export function flagNode(nodeId, { type = 'Flagged', description }) {
  return nodesRepository.flagNode(nodeId, { type, description });
}

/** Groups alerts by type for the summary strip on the alerts page. */
export function groupByType(alerts) {
  const groups = new Map();
  for (const alert of alerts) {
    if (!groups.has(alert.Alert_Type)) {
      groups.set(alert.Alert_Type, { type: alert.Alert_Type, severity: alert.severity, open: 0, resolved: 0 });
    }
    const group = groups.get(alert.Alert_Type);
    if (alert.Is_Resolved) group.resolved += 1;
    else group.open += 1;
  }
  return [...groups.values()].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
