import { query, queryAll, queryOne, transaction } from '../db/pool.js';
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
  tracked,
  rf_tag,
  notes
`;

export async function createGateway({ Gateway_Code, Gateway_Name }) {
  const row = await queryOne(
    `insert into gateway (gateway_code, gateway_name, status)
     values ($1, $2, 'Offline')
     returning id, gateway_code, gateway_name, status, last_ping`,
    [Gateway_Code, Gateway_Name],
  );
  return mapGateway(row);
}

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
           n.node_code,
           n.report_interval_seconds,
           n.latitude,
           n.longitude,
           n.rf_tag,
           n.notes,
           b.id as bucket_id,
           b.barcode_id,
           b.tare_weight,
           b.status as bucket_status,
           m.weight,
           m.temperature,
           m.sugar_percent,
           m.ice_present,
           m.sap_flow_rate_lph,
           m.recorded_at
      from node n
      left join buckets b on b.node_id = n.id and b.node_id is not null
      left join lateral (
        select weight, temperature, sugar_percent, ice_present, sap_flow_rate_lph, recorded_at
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
    Node_Code: row.node_code,
    Report_Interval_Seconds: row.report_interval_seconds == null ? null : Number(row.report_interval_seconds),
    Location: row.latitude == null || row.longitude == null ? null : { lat: Number(row.latitude), lon: Number(row.longitude) },
    Rf_Tag: row.rf_tag ?? null,
    Notes: row.notes ?? null,
    BucketID: row.bucket_id,
    Barcode_ID: row.barcode_id,
    Tare_Weight: row.tare_weight == null ? null : Number(row.tare_weight),
    Bucket_Status: row.bucket_status,
    Weight: row.weight == null ? null : Number(row.weight),
    Temperature: row.temperature == null ? null : Number(row.temperature),
    Sugar_Percent: row.sugar_percent == null ? null : Number(row.sugar_percent),
    Sap_Flow_Rate_Lph: row.sap_flow_rate_lph == null ? null : Number(row.sap_flow_rate_lph),
    Ice_Present: Boolean(row.ice_present),
    Recorded_At: row.recorded_at instanceof Date ? row.recorded_at.toISOString() : row.recorded_at,
  }));
}

export async function findNodeById(id) {
  const row = await queryOne(`select ${NODE_COLUMNS} from node where id = $1`, [id]);
  return row ? mapNode(row) : null;
}

/** The Pi names itself with gateway_code, not the database id. */
export async function findGatewayByCode(code) {
  const row = await queryOne(
    `select id, gateway_code
       from gateway
      where upper(gateway_code) = upper($1)`,
    [code],
  );
  if (!row) return null;
  return { GatewayID: row.id, Gateway_Code: row.gateway_code };
}

/**
 * Resolves the node a sensor reading belongs to.
 *
 * Hardware ids win over a guessed database id only by the order the Pi sends:
 * an explicit NodeID is trusted first, then the node code, then the LoRa id.
 */
export async function findNodeForIngest({ NodeID, Node_Code, LoRa_Device_ID }) {
  if (NodeID != null) return findNodeById(NodeID);
  if (Node_Code) {
    const row = await queryOne(`select ${NODE_COLUMNS} from node where node_code = $1`, [Node_Code]);
    return row ? mapNode(row) : null;
  }
  if (LoRa_Device_ID) {
    const row = await queryOne(
      `select ${NODE_COLUMNS} from node where lora_device_id = $1`,
      [LoRa_Device_ID],
    );
    return row ? mapNode(row) : null;
  }
  return null;
}

/** The bucket currently hung on a tree, when one is on record. */
export async function findBucketIdForNode(nodeId) {
  const row = await queryOne(
    'select id from buckets where node_id = $1 order by id limit 1',
    [nodeId],
  );
  return row?.id ?? null;
}

/**
 * Marks a node heard from. Maintenance stays maintenance; anything else is
 * online, because a reading just arrived.
 */
export async function recordNodeHeartbeat(id, { batteryPercent = null, signalRssi = null } = {}) {
  await query(
    `update node
        set last_seen = CURRENT_TIMESTAMP,
            battery_level = coalesce($2, battery_level),
            signal_rssi = coalesce($3, signal_rssi),
            status_code = case when status_code = 3 then status_code else 1 end
      where id = $1`,
    [id, batteryPercent, signalRssi],
  );
}

/** A successful push means this Pi is on the network. */
export async function touchGateway(id, ipAddress) {
  const ip = ipAddress ? String(ipAddress).slice(0, 45) : null;
  await query(
    `update gateway
        set last_ping = CURRENT_TIMESTAMP,
            status = 'Online',
            ip_address = coalesce($2, ip_address)
      where id = $1`,
    [id, ip],
  );
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
  Report_Interval_Seconds: 'report_interval_seconds',
  Rf_Tag: 'rf_tag',
  Notes: 'notes',
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

/**
 * Registers a tree that is about to be flashed. The node code is assigned here
 * so the web flasher can write the same id into the Heltec.
 */
export async function createDeployedNode(input) {
  return transaction(async (client) => {
    const next = await client.query(
      `select coalesce(max(substring(node_code from 6)::int), 0) + 1 as n
         from node
        where node_code ~ '^NODE-[0-9]+$'`,
    );
    const nodeCode = `NODE-${String(next.rows[0].n).padStart(3, '0')}`;
    const gateway = input.GatewayID
      ? await client.query('select id from gateway where id = $1', [input.GatewayID])
      : await client.query('select id from gateway order by id limit 1');
    const inserted = await client.query(
      `insert into node (
         gateway_id, node_code, lora_device_id, node_name, status_code,
         latitude, longitude, stand, tracked, rf_tag, notes
       )
       values ($1, $2, $2, $3, 0, $4, $5, $6, true, $7, $8)
       returning ${NODE_COLUMNS}`,
      [
        gateway.rows[0]?.id ?? null,
        nodeCode,
        input.Node_Name,
        input.Latitude,
        input.Longitude,
        input.Stand,
        input.Rf_Tag || null,
        input.Notes || null,
      ],
    );
    const node = inserted.rows[0];
    await client.query(
      `insert into buckets (node_id, barcode_id, status, tare_weight, capacity_liters, tree_species)
       values ($1, $2, 'At Tree', $3, 37.85, $4)`,
      [
        node.id,
        input.Barcode_ID || `BKT-${String(node.id).padStart(3, '0')}`,
        input.Tare_Weight ?? 2.5,
        input.Tree_Species || 'Sugar Maple',
      ],
    );
    return mapNode(node);
  });
}

/** Removes a deployed node and the rows that point at it. */
export async function deleteNode(id) {
  return transaction(async (client) => {
    const existing = await client.query('select id from node where id = $1', [id]);
    if (!existing.rows[0]) return false;

    await client.query('update schedule_slots set node_id = null where node_id = $1', [id]);
    await client.query('delete from sap_daily where node_id = $1', [id]);
    await client.query('delete from collection_journal where node_id = $1', [id]);
    await client.query('delete from collection_logs where node_id = $1', [id]);
    await client.query('delete from alerts where node_id = $1', [id]);
    await client.query('delete from metrics where node_id = $1', [id]);
    await client.query('delete from buckets where node_id = $1', [id]);
    await client.query('delete from node where id = $1', [id]);
    return true;
  });
}

/** Tare weight of the bucket currently on a node, needed for net-weight rules. */
export async function findTareWeightForNode(nodeId) {
  const row = await queryOne(
    'select tare_weight from buckets where node_id = $1 order by id limit 1',
    [nodeId],
  );
  return row?.tare_weight ?? null;
}
