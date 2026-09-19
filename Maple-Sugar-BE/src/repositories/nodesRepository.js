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
  last_seen
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
