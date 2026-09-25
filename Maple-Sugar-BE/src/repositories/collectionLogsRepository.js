import { queryAll, queryOne } from '../db/pool.js';
import { mapCollectionLog } from './mappers.js';

const LOG_COLUMNS = `
  id,
  bucket_id,
  user_id,
  node_id,
  collected_at,
  volume_collected,
  quality_notes
`;

export async function listCollectionLogs({ season, from, to } = {}) {
  const conditions = [];
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

  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';

  const rows = await queryAll(
    `select ${LOG_COLUMNS} from collection_logs ${where} order by collected_at desc, id desc`,
    values,
  );
  return rows.map(mapCollectionLog);
}

export async function createCollectionLog(entry) {
  const row = await queryOne(
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
  return mapCollectionLog(row);
}
