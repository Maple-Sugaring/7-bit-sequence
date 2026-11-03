import { queryOne, queryOneOn, transaction } from '../db/pool.js';

const COMMAND_COLUMNS = `
  id,
  node_id,
  action,
  pounds,
  status,
  counts_per_lb,
  requested_by_user_id,
  created_at,
  sent_at,
  completed_at
`;

function iso(value) {
  return value instanceof Date ? value.toISOString() : (value ?? null);
}

function mapCommand(row) {
  if (!row) return null;
  return {
    CommandID: row.id,
    NodeID: row.node_id,
    Action: row.action,
    Pounds: row.pounds == null ? null : Number(row.pounds),
    Status: row.status,
    Counts_Per_Lb: row.counts_per_lb == null ? null : Number(row.counts_per_lb),
    Requested_By_UserID: row.requested_by_user_id ?? null,
    Created_At: iso(row.created_at),
    Sent_At: iso(row.sent_at),
    Completed_At: iso(row.completed_at),
  };
}

const CANCEL_OPEN = `
  update calibration_commands
     set status = 'cancelled', completed_at = CURRENT_TIMESTAMP
   where node_id = $1 and status in ('pending', 'sent')
  returning ${COMMAND_COLUMNS}
`;

/** A new request replaces whatever was still waiting for that node. */
export async function queueCommand({ nodeId, action, pounds = null, userId = null }) {
  return transaction(async (client) => {
    await client.query(CANCEL_OPEN, [nodeId]);
    const row = await queryOneOn(
      client,
      `insert into calibration_commands (node_id, action, pounds, requested_by_user_id)
       values ($1, $2, $3, $4)
       returning ${COMMAND_COLUMNS}`,
      [nodeId, action, pounds, userId],
    );
    return mapCommand(row);
  });
}

export async function findOpenCommand(nodeId) {
  const row = await queryOne(
    `select ${COMMAND_COLUMNS}
       from calibration_commands
      where node_id = $1 and status in ('pending', 'sent')
      order by id desc
      limit 1`,
    [nodeId],
  );
  return mapCommand(row);
}

export async function findLatestCommand(nodeId) {
  const row = await queryOne(
    `select ${COMMAND_COLUMNS}
       from calibration_commands
      where node_id = $1
      order by id desc
      limit 1`,
    [nodeId],
  );
  return mapCommand(row);
}

/** The last test-weight calibration that worked, so the page can show the scale factor. */
export async function findLastCalibration(nodeId) {
  const row = await queryOne(
    `select ${COMMAND_COLUMNS}
       from calibration_commands
      where node_id = $1 and action = 'calibrate' and status = 'done'
      order by id desc
      limit 1`,
    [nodeId],
  );
  return mapCommand(row);
}

/**
 * The newest scale factor the node reported. Every ack carries the node's
 * counts per pound, a tare's too, so this also catches a calibration done over
 * USB that the app never asked for.
 */
export async function findLastScale(nodeId) {
  const row = await queryOne(
    `select ${COMMAND_COLUMNS}
       from calibration_commands
      where node_id = $1 and status = 'done' and counts_per_lb is not null
      order by id desc
      limit 1`,
    [nodeId],
  );
  return mapCommand(row);
}

/** Stops the Pi radioing a command the person gave up on. Null when nothing was waiting. */
export async function cancelOpenCommand(nodeId) {
  return mapCommand(await queryOne(CANCEL_OPEN, [nodeId]));
}

export async function markSent(commandId) {
  await queryOne(
    `update calibration_commands
        set status = 'sent', sent_at = coalesce(sent_at, CURRENT_TIMESTAMP)
      where id = $1 and status = 'pending'
      returning id`,
    [commandId],
  );
}

export async function settleCommand(commandId, { status, countsPerLb = null }) {
  const row = await queryOne(
    `update calibration_commands
        set status = $2,
            counts_per_lb = $3,
            completed_at = CURRENT_TIMESTAMP
      where id = $1 and status in ('pending', 'sent')
      returning ${COMMAND_COLUMNS}`,
    [commandId, status, countsPerLb],
  );
  return mapCommand(row);
}
