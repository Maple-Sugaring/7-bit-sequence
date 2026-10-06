import { queryAll, queryOneOn } from '../db/pool.js';

function iso(value) {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function num(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapEntry(row) {
  return {
    EntryID: row.id,
    UserID: row.user_id,
    Author: row.author_name ?? '',
    NodeID: row.node_id,
    Node_Name: row.node_name ?? null,
    BucketID: row.bucket_id,
    Collected_At: iso(row.collected_at),
    Title: row.title,
    Process_Notes: row.process_notes,
    Weight_Lb: num(row.weight_lb),
    Sugar_Percent: num(row.sugar_percent),
    Ice_Present: Boolean(row.ice_present),
    Round_Label: row.round_label ?? null,
  };
}

const SELECT = `
  select j.id, j.user_id, j.node_id, j.bucket_id, j.collected_at, j.title,
         j.process_notes, j.weight_lb, j.sugar_percent, j.ice_present,
         j.round_label,
         u.full_name as author_name,
         n.node_name
    from collection_journal j
    left join users u on u.id = j.user_id
    left join node n on n.id = j.node_id
`;

export async function listEntries(userId) {
  const values = [];
  let where = '';
  if (userId != null) {
    values.push(userId);
    where = 'where j.user_id = $1';
  }
  const rows = await queryAll(`${SELECT} ${where} order by j.collected_at desc, j.id desc`, values);
  return rows.map(mapEntry);
}

/** The entry a phone already uploaded under this reference, if any. */
export async function findByClientRef(clientRef, client = null) {
  const row = await queryOneOn(client, `${SELECT} where j.client_ref = $1`, [clientRef]);
  return row ? mapEntry(row) : null;
}

/** `client` is a transaction client when the entry is one write among several. */
export async function createEntry(entry, client = null) {
  const row = await queryOneOn(
    client,
    `insert into collection_journal
       (user_id, node_id, bucket_id, collected_at, title, process_notes,
        weight_lb, sugar_percent, ice_present, round_label, client_ref)
     values ($1, $2, $3, coalesce($4, CURRENT_TIMESTAMP), $5, $6, $7, $8, $9, $10, $11)
     returning id`,
    [
      entry.UserID,
      entry.NodeID ?? null,
      entry.BucketID ?? null,
      entry.Collected_At ?? null,
      entry.Title,
      entry.Process_Notes,
      entry.Weight ?? null,
      entry.Sugar_Percent ?? null,
      Boolean(entry.Ice_Present),
      entry.Round_Label ?? null,
      entry.Client_Ref ?? null,
    ],
  );
  const saved = await queryOneOn(client, `${SELECT} where j.id = $1`, [row.id]);
  return mapEntry(saved);
}
