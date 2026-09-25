import { queryAll, queryOne } from '../db/pool.js';
import { mapBucket } from './mappers.js';

const BUCKET_COLUMNS = `
  id,
  node_id,
  barcode_id,
  status,
  tare_weight
`;

export async function listBuckets() {
  const rows = await queryAll(`select ${BUCKET_COLUMNS} from buckets order by id`);
  return rows.map(mapBucket);
}

export async function findBucketById(id) {
  const row = await queryOne(`select ${BUCKET_COLUMNS} from buckets where id = $1`, [id]);
  return row ? mapBucket(row) : null;
}
