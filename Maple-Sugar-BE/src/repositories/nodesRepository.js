import { queryAll, queryOne } from '../db/pool.js';
import { mapGateway, mapNode } from './mappers.js';

const NODE_COLUMNS = `
  id,
  gateway_id,
  node_code,
  lora_device_id,
  node_name,
  status_code,
  battery_level,
  signal_rssi,
  latitude,
  longitude,
  stand,
  last_seen,
  report_interval_seconds,
  tracked
`;

export async function listGateways() {
  const rows = await queryAll(`
    select id, gateway_code, gateway_name, status, last_ping
      from gateway
     order by id
  `);
  return rows.map(mapGateway);
}

export async function listNodes() {
  // Ordered by stand then name so the device list and the dashboard's
  // per-stand grouping agree without the client re-sorting.
  const rows = await queryAll(`
    select ${NODE_COLUMNS}
      from node
     order by stand nulls last, node_name
  `);
  return rows.map(mapNode);
}

export async function listBoard() {
  const rows = await queryAll(`
    select n.id,
           n.node_name,
           n.stand,
           n.status_code,
           n.battery_level,
           n.signal_rssi,
           n.last_seen,
           b.id as bucket_id,
           b.barcode_id,
           b.tare_weight,
           b.status as bucket_status,
           m.weight,
           m.temperature,
           m.sugar_percent,
           m.ice_present,
           m.recorded_at
      from node n
      left join buckets b on b.node_id = n.id and b.node_id is not null
      left join lateral (
        select weight, temperature, sugar_percent, ice_present, recorded_at
          from metrics
         where node_id = n.id
         order by recorded_at desc
         limit 1
      ) m on true
     where n.tracked
     order by n.stand, n.id
  `);

  return rows.map((row) => ({
    NodeID: row.id,
    Node_Name: row.node_name,
    Stand: row.stand,
    Status_Code: row.status_code,
    Battery_Percent: row.battery_level == null ? null : Number(row.battery_level),
    Signal_Rssi: row.signal_rssi,
    Last_Seen: row.last_seen instanceof Date ? row.last_seen.toISOString() : row.last_seen,
    BucketID: row.bucket_id,
    Barcode_ID: row.barcode_id,
    Tare_Weight: row.tare_weight == null ? null : Number(row.tare_weight),
    Bucket_Status: row.bucket_status,
    Weight: row.weight == null ? null : Number(row.weight),
    Temperature: row.temperature == null ? null : Number(row.temperature),
    Sugar_Percent: row.sugar_percent == null ? null : Number(row.sugar_percent),
    Ice_Present: Boolean(row.ice_present),
    Recorded_At: row.recorded_at instanceof Date ? row.recorded_at.toISOString() : row.recorded_at,
  }));
}

export async function findNodeById(id) {
  const row = await queryOne(`select ${NODE_COLUMNS} from node where id = $1`, [id]);
  return row ? mapNode(row) : null;
}

/**
 * Writable node fields. Status_Code is the one the UI changes, taking a node
 * in and out of maintenance; the rest are here for admin correction of a
 * mis-registered device.
 */
const WRITABLE_NODE_COLUMNS = {
  Status_Code: 'status_code',
  Node_Name: 'node_name',
  Stand: 'stand',
  GatewayID: 'gateway_id',
  Battery_Percent: 'battery_level',
  Signal_Rssi: 'signal_rssi',
  LoRa_Device_ID: 'lora_device_id',
};

export async function updateNode(id, changes) {
  const assignments = [];
  const values = [id];

  for (const [field, column] of Object.entries(WRITABLE_NODE_COLUMNS)) {
    if (field in changes) {
      values.push(changes[field]);
      assignments.push(`${column} = $${values.length}`);
    }
  }

  // Location arrives nested from the client but is stored as two columns.
  if (changes.Location) {
    values.push(changes.Location.lat);
    assignments.push(`latitude = $${values.length}`);
    values.push(changes.Location.lon);
    assignments.push(`longitude = $${values.length}`);
  }

  if (!assignments.length) return findNodeById(id);

  const row = await queryOne(
    `update node set ${assignments.join(', ')} where id = $1 returning ${NODE_COLUMNS}`,
    values,
  );
  return row ? mapNode(row) : null;
}

/** Tare weight of the bucket currently on a node, needed for net-weight rules. */
export async function findTareWeightForNode(nodeId) {
  const row = await queryOne(
    'select tare_weight from buckets where node_id = $1 order by id limit 1',
    [nodeId],
  );
  return row?.tare_weight ?? null;
}
