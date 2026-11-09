import { queryAll, queryOneOn, transaction } from '../db/pool.js';
import { mapCollectionLog } from './mappers.js';

const LOG_COLUMNS = `
  id,
  bucket_id,
  user_id,
  node_id,
  collected_at,
  volume_collected,
  quality_notes,
  data_mode
`;

export async function listCollectionLogs({ season, from, to, before, limit } = {}) {
  const conditions = ['data_mode = active_data_mode()'];
  const values = [];

  if (season != null) {
    values.push(season);
    conditions.push(`sap_season(collected_at) = $${values.length}`);
  }
  if (from) {
    values.push(from);
    conditions.push(`collected_at >= $${values.length}`);
  }
  if (to) {
    values.push(to);
    conditions.push(`collected_at <= $${values.length}`);
  }

  if (before != null) {
    values.push(before);
    conditions.push(`(collected_at, id) < (select collected_at, id from collection_logs where id = $${values.length} and data_mode = active_data_mode())`);
  }
  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';

  const page = limit == null ? '' : `limit $${values.push(limit)}`;
  const rows = await queryAll(
    `select ${LOG_COLUMNS} from collection_logs ${where} order by collected_at desc, id desc ${page}`,
    values,
  );
  return rows.map(mapCollectionLog);
}

export async function createCollectionLog(entry, client = null) {
  if (!client) return transaction((tx) => createCollectionLog(entry, tx));
  const row = await queryOneOn(
    client,
    `insert into collection_logs (bucket_id, node_id, user_id, collected_at,
                                 volume_collected, quality_notes)
     values ($1, $2, $3, coalesce($4, CURRENT_TIMESTAMP), $5, $6)
     returning ${LOG_COLUMNS}`,
    [
      entry.BucketID,
      entry.NodeID,
      entry.UserID ?? null,
      entry.Collected_At ?? null,
      entry.Volume_Collected,
      entry.Quality_Notes ?? '',
    ],
  );
  await client.query(
    "insert into audit_events (event_type, actor_id, target_id, note) values ('collection_created', $1, $2, $3)",
    [entry.UserID ?? null, row.id, `Collection recorded for node ${row.node_id}.`],
  );
  return mapCollectionLog(row);
}
