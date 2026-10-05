import { query, queryAll, queryOne } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { notifyCriticalAlert } from '../services/notificationService.js';
import { mapAlert } from './mappers.js';

const ALERT_COLUMNS = `
  id,
  node_id,
  alert_type,
  severity,
  message,
  is_resolved,
  created_at
`;

export async function listAlerts({ resolved } = {}) {
  const conditions = [];
  const values = [];

  if (resolved != null) {
    values.push(resolved);
    conditions.push(`is_resolved = $${values.length}`);
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';

  // Newest first: the alerts page and the notification bell both show the most
  // recent, and the mock transport prepends new alerts to the same effect.
  const rows = await queryAll(
    `select ${ALERT_COLUMNS} from alerts ${where} order by created_at desc, id desc`,
    values,
  );
  return rows.map(mapAlert);
}

export async function findAlertById(id) {
  const row = await queryOne(`select ${ALERT_COLUMNS} from alerts where id = $1`, [id]);
  return row ? mapAlert(row) : null;
}

export async function createAlert({ NodeID, Alert_Type, Description, severity = 'warning' }) {
  const row = await queryOne(
    `insert into alerts (node_id, alert_type, severity, message, is_resolved)
     values ($1, $2, $3, $4, false)
     returning ${ALERT_COLUMNS}`,
    [NodeID, Alert_Type, severity, Description],
  );
  const alert = mapAlert(row);
  // Delivery is best-effort. A mail outage must not roll back the alert row.
  void notifyCriticalAlert({ ...alert, severity, Alert_Type }).catch((error) => {
    logger.error({ err: error, alertId: alert.AlertID }, 'Critical notification failed');
  });
  return alert;
}

/**
 * True when an unresolved alert of this type already exists for the node.
 *
 * Sensor-derived alerts are re-evaluated on every incoming reading, so without
 * this a node sitting above the spoilage threshold would raise a fresh alert
 * every few seconds and bury the alerts page.
 */
export async function hasOpenAlertOfType(nodeId, alertType) {
  const row = await queryOne(
    `select 1 from alerts
      where alert_type = $2
        and is_resolved = false
        and node_id is not distinct from $1
      limit 1`,
    [nodeId, alertType],
  );
  return Boolean(row);
}

export async function setResolved(id, isResolved) {
  const row = await queryOne(
    `update alerts set is_resolved = $2 where id = $1 returning ${ALERT_COLUMNS}`,
    [id, isResolved],
  );
  return row ? mapAlert(row) : null;
}

/** Closes every open alert of the given types on one node. */
export async function resolveOpenByTypes(nodeId, types) {
  if (!types?.length) return 0;
  const result = await query(
    `update alerts
        set is_resolved = true
      where node_id = $1
        and is_resolved = false
        and alert_type = any($2::text[])`,
    [nodeId, types],
  );
  return result.rowCount ?? 0;
}
