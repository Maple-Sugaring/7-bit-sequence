import { queryAll, queryOne } from '../db/pool.js';
import { FAULT_ALERT_TYPES } from '../business/alerting.js';

export function listSensorLifecycle() {
  return queryAll(`
    select n.id as "NodeID", coalesce(n.node_name, n.node_code) as "Name",
           n.status_code as "Status", n.battery_level as "Battery", n.signal_rssi as "Signal",
           n.battery_reported_at as "BatteryReportedAt", n.signal_reported_at as "SignalReportedAt",
           n.tap_removed as "TapRemoved", n.last_seen as "LastSeen", n.report_interval_seconds as "ReportInterval",
           fault.alert_type as "Fault",
           coalesce(events.history, '[]'::json) as "History"
      from visible_nodes n
      left join lateral (
        select json_agg(json_build_object(
          'id', id, 'type', event_type, 'date', event_date, 'sensorType', sensor_type,
          'notes', notes, 'assumed', assumed
        ) order by event_date desc, id desc) as history
          from sensor_lifecycle_events where node_id = n.id
      ) events on true
      left join lateral (
        select alert_type from alerts
         where node_id = n.id and data_mode = active_data_mode() and not is_resolved and alert_type = any($1::text[])
         order by created_at desc, id desc limit 1
      ) fault on true
     order by n.id
  `, [[...FAULT_ALERT_TYPES, 'Tipped', 'Spill']]);
}

export function recordSensorEvent(nodeId, event, userId) {
  return queryOne(`
    insert into sensor_lifecycle_events (node_id, event_type, event_date, sensor_type, notes, recorded_by)
    select id, $2, $3, $4, $5, $6 from visible_nodes where id = $1
    returning id
  `, [nodeId, event.type, event.date, event.sensorType ?? null, event.notes ?? null, userId]);
}
