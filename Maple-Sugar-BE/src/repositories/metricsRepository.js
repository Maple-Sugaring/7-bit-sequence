import { queryAll, queryOne, queryOneOn, transaction } from '../db/pool.js';
import { mapMetric } from './mappers.js';
import { listAggregates } from './metricAggregatesRepository.js';

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
  ice_present,
  sap_flow_rate_lph,
  corrected_at,
  corrected_by_user_id,
  revision,
  correction_note,
  data_mode
`;

/**
 * Filtered reading list.
 *
 * Filters are composed into a parameterized WHERE rather than interpolated, and
 * `season` goes through the indexed sap_season() expression from migration 002
 * rather than a range on recorded_at, so the season boundary rule lives in
 * exactly one place.
 *
 * Periods the retention job compacted (BRU-007) come back as one averaged row
 * per node, bucket and hour (`Aggregated: true`), so season comparisons and
 * exports still see older years. Pass `aggregates: false` for raw rows only.
 */
export async function listMetrics({ nodeId, season, from, to, aggregates = true } = {}) {
  const filters = { nodeId, season, from, to };
  if (!aggregates) return listRawMetrics(filters);

  // Both tables must use one snapshot: compaction between these reads would
  // otherwise return the same samples once raw and again as an aggregate.
  return transaction(async (client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const raw = await listRawMetrics(filters, client);
    const compacted = await listAggregates(filters, client);
    return [...raw, ...compacted].sort(
      (a, b) => new Date(b.Recorded_At) - new Date(a.Recorded_At) || (b.MetricID ?? 0) - (a.MetricID ?? 0),
    );
  });
}

async function listRawMetrics({ nodeId, season, from, to }, client = null) {
  const conditions = ['data_mode = active_data_mode()'];
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

  const sql = `select ${METRIC_COLUMNS} from metrics ${where} order by recorded_at desc, id desc`;
  const rows = client ? (await client.query(sql, values)).rows : await queryAll(sql, values);
  return rows.map(mapMetric);
}

export async function findMetricById(id, client = null) {
  const lock = client ? 'for update' : '';
  const row = await queryOneOn(client, `select ${METRIC_COLUMNS} from metrics where id = $1 and data_mode = lock_data_mode() ${lock}`, [id]);
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
      where node_id = $1 and data_mode = active_data_mode()
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

/** `client` is a transaction client when the reading is one write among several. */
export async function createMetric(reading, client = null) {
  const row = await queryOneOn(
    client,
    `insert into metrics (node_id, bucket_id, recorded_by_user_id, recorded_at,
                          weight, temperature, sugar_percent, weather_conditions, ice_present,
                          sap_flow_rate_lph)
     values ($1, $2, $3, coalesce($4, CURRENT_TIMESTAMP), $5, $6, $7, $8, $9, $10)
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
      reading.Sap_Flow_Rate_Lph ?? null,
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

/**
 * Stamps who corrected the reading and when. The retention job never folds a
 * corrected row into an aggregate, so the correction stays visible as its own
 * row with its provenance.
 */
export async function updateMetric(id, changes, correctedByUserId, note = null, client = null) {
  const assignments = [];
  const values = [id];

  for (const [field, column] of Object.entries(WRITABLE_METRIC_COLUMNS)) {
    if (field in changes) {
      values.push(changes[field]);
      assignments.push(`${column} = $${values.length}`);
    }
  }

  if (!assignments.length) return findMetricById(id);

  values.push(correctedByUserId);
  assignments.push('corrected_at = CURRENT_TIMESTAMP', `corrected_by_user_id = $${values.length}`);

  values.push(note);
  assignments.push('revision = revision + 1', `correction_note = $${values.length}`);

  const row = await queryOneOn(
    client,
    `update metrics set ${assignments.join(', ')} where id = $1 returning ${METRIC_COLUMNS}`,
    values,
  );
  return row ? mapMetric(row) : null;
}
