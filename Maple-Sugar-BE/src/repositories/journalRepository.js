import { queryAll, queryOne } from '../db/pool.js';

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
  };
}

const SELECT = `
  select j.id, j.user_id, j.node_id, j.bucket_id, j.collected_at, j.title,
         j.process_notes, j.weight_lb, j.sugar_percent, j.ice_present,
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

export async function createEntry(entry) {
  const row = await queryOne(
    `insert into collection_journal
       (user_id, node_id, bucket_id, collected_at, title, process_notes,
        weight_lb, sugar_percent, ice_present)
     values ($1, $2, $3, coalesce($4, CURRENT_TIMESTAMP), $5, $6, $7, $8, $9)
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
    ],
  );
  const saved = await queryOne(`${SELECT} where j.id = $1`, [row.id]);
  return mapEntry(saved);
}
