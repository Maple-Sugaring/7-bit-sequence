/**
 * Removes the fixture bush inserted by migrations/003_seed.sql.
 *
 * Runs on every API boot, including a fresh container. Nodes registered from
 * Deploy use a different LoRa id, so they stay. Roles, accounts, and guides
 * stay too. A gateway added from Deploy stays even when its code matches an
 * old fixture name such as GW-ALUMNI.
 */

import { logger } from '../lib/logger.js';
import { transaction } from './pool.js';

/** LoRa ids baked into 003_seed.sql. A deployed node does not use these. */
export const SEEDED_LORA_IDS = [
  'E8:9F:6D:11:A2:41',
  'E8:9F:6D:12:A2:42',
  'E8:9F:6D:13:A2:43',
  'E8:9F:6D:14:A2:44',
  'E8:9F:6D:15:A2:45',
  'E8:9F:6D:16:A2:46',
  'E8:9F:6D:17:A2:47',
  'E8:9F:6D:18:A2:48',
  'E8:9F:6D:19:A2:49',
  'E8:9F:6D:1A:A2:4A',
  'E8:9F:6D:1B:A2:4B',
  'E8:9F:6D:1C:A2:4C',
  'E8:9F:6D:1D:A2:4D',
  'E8:9F:6D:1E:A2:4E',
  'E8:9F:6D:1F:A2:4F',
  'E8:9F:6D:20:A2:50',
];

/** Stands that exist only in the generated fixture schedule. */
export const SEEDED_STANDS = ['Hill Bottom', 'Rabbi House', 'Sugar Shack', 'North Ridge'];

/**
 * Old fixture Pi codes that may linger from earlier migrations. GW-ALUMNI is
 * intentionally absent: that is the live campus Pi code used from Deploy.
 */
export const SEEDED_GATEWAY_CODES = ['GW-SHACK', 'GW-RELAY', 'GW-CHABAD', 'GW-BARN'];

export async function clearSeededData() {
  return transaction(async (client) => {
    const found = await client.query(
      `select id from node where lora_device_id = any($1::text[])`,
      [SEEDED_LORA_IDS],
    );
    const nodeIds = found.rows.map((row) => row.id);

    if (nodeIds.length) {
      await client.query(`update schedule_slots set node_id = null where node_id = any($1::int[])`, [nodeIds]);
      await client.query(`delete from sap_daily where node_id = any($1::int[])`, [nodeIds]);
      await client.query(`delete from collection_journal where node_id = any($1::int[])`, [nodeIds]);
      await client.query(`delete from collection_logs where node_id = any($1::int[])`, [nodeIds]);
      await client.query(`delete from alerts where node_id = any($1::int[])`, [nodeIds]);
      await client.query(`delete from metrics where node_id = any($1::int[])`, [nodeIds]);
      await client.query(`delete from buckets where node_id = any($1::int[])`, [nodeIds]);
      await client.query(`delete from node where id = any($1::int[])`, [nodeIds]);
    }

    const slots = await client.query(
      `delete from schedule_assignments
        where slot_id in (select id from schedule_slots where stand = any($1::text[]))`,
      [SEEDED_STANDS],
    );
    const shifts = await client.query(
      `delete from schedule_slots where stand = any($1::text[])`,
      [SEEDED_STANDS],
    );

    // Only detach leftover fixture gateways from already-deleted seed nodes.
    // Never strip a gateway that still has a Deployed node on it.
    await client.query(
      `update node
          set gateway_id = null
        where lora_device_id = any($1::text[])
          and gateway_id in (
            select id from gateway where gateway_code = any($2::text[])
          )`,
      [SEEDED_LORA_IDS, SEEDED_GATEWAY_CODES],
    );
    const gateways = await client.query(
      `delete from gateway g
        where g.gateway_code = any($1::text[])
          and not exists (select 1 from node n where n.gateway_id = g.id)`,
      [SEEDED_GATEWAY_CODES],
    );

    const removed = {
      nodes: nodeIds.length,
      shifts: shifts.rowCount ?? 0,
      assignments: slots.rowCount ?? 0,
      gateways: gateways.rowCount ?? 0,
    };
    if (removed.nodes || removed.shifts || removed.gateways) {
      logger.info(removed, 'Cleared seeded nodes, gateways, and fixture schedule');
    }
    return removed;
  });
}
