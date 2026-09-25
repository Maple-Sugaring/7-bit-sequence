import { queryAll, queryOne } from '../db/pool.js';
import { mapMetric } from './mappers.js';

const METRIC_COLUMNS = `
  id,
  node_id,
  bucket_id,
  recorded_by_user_id,
  recorded_at,
  weight,
  temperature,
  sugar_percent,
  weather_conditions,
  ice_present
`;

/**
 * Filtered reading list.
 *
 * Filters are composed into a parameterized WHERE rather than interpolated, and
 * `season` goes through the indexed sap_season() expression from migration 002
 * rather than a range on recorded_at, so the season boundary rule lives in
 * exactly one place.
 */
export async function listMetrics({ nodeId, season, from, to } = {}) {
  const conditions = [];
  const values = [];

  if (nodeId != null) {
    values.push(nodeId);
    conditions.push(`node_id = $${values.length}`);
  }
  if (season != null) {
    values.push(season);
    conditions.push(`sap_season(recorded_at) = $${values.length}`);
  }
  if (from) {
    values.push(from);
    conditions.push(`recorded_at >= $${values.length}`);
  }
  if (to) {
    values.push(to);
    conditions.push(`recorded_at <= $${values.length}`);
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';

  const rows = await queryAll(
    `select ${METRIC_COLUMNS} from metrics ${where} order by recorded_at desc, id desc`,
    values,
  );
  return rows.map(mapMetric);
}

export async function findMetricById(id) {
  const row = await queryOne(`select ${METRIC_COLUMNS} from metrics where id = $1`, [id]);
  return row ? mapMetric(row) : null;
}

/**
 * Recent readings for one node, newest first. Used by spoilage detection to
 * work out how long a node has been above the threshold, so the window needs to
 * comfortably exceed the critical exposure period.
 */
export async function listRecentForNode(nodeId, limit = 24) {
  const rows = await queryAll(
    `select ${METRIC_COLUMNS}
       from metrics
      where node_id = $1
      order by recorded_at desc
      limit $2`,
    [nodeId, limit],
  );
  return rows.map(mapMetric);
}

/**
 * A Pi retry sends the same node and timestamp. Matching that pair returns the
 * row already stored so the retry does not become a second reading.
 */
export async function findMetricByNodeAndTime(nodeId, recordedAt) {
  const row = await queryOne(
    `select ${METRIC_COLUMNS}
       from metrics
      where node_id = $1
        and recorded_at = $2::timestamptz`,
    [nodeId, recordedAt],
  );
  return row ? mapMetric(row) : null;
}

export async function createMetric(reading) {
  const row = await queryOne(
    `insert into metrics (node_id, bucket_id, recorded_by_user_id, recorded_at,
                          weight, temperature, sugar_percent, weather_conditions, ice_present)
     values ($1, $2, $3, coalesce($4, CURRENT_TIMESTAMP), $5, $6, $7, $8, $9)
     returning ${METRIC_COLUMNS}`,
    [
      reading.NodeID,
      reading.BucketID ?? null,
      reading.Recorded_By_UserID ?? null,
      reading.Recorded_At ?? null,
      reading.Weight ?? null,
      reading.Temperature ?? null,
      reading.Sugar_Percent ?? null,
      reading.Weather_Conditions ?? null,
      Boolean(reading.Ice_Present),
    ],
  );
  return mapMetric(row);
}

/**
 * Correcting a recorded reading. NodeID is deliberately not writable: moving a
 * reading between trees would silently rewrite two nodes' histories, and the
 * right fix for a reading filed against the wrong tree is to delete and re-add.
 */
const WRITABLE_METRIC_COLUMNS = {
  BucketID: 'bucket_id',
  Recorded_At: 'recorded_at',
  Weight: 'weight',
  Temperature: 'temperature',
  Sugar_Percent: 'sugar_percent',
  Weather_Conditions: 'weather_conditions',
  Ice_Present: 'ice_present',
};

export async function updateMetric(id, changes) {
  const assignments = [];
  const values = [id];

  for (const [field, column] of Object.entries(WRITABLE_METRIC_COLUMNS)) {
    if (field in changes) {
      values.push(changes[field]);
      assignments.push(`${column} = $${values.length}`);
    }
  }

  if (!assignments.length) return findMetricById(id);

  const row = await queryOne(
    `update metrics set ${assignments.join(', ')} where id = $1 returning ${METRIC_COLUMNS}`,
    values,
  );
  return row ? mapMetric(row) : null;
}
