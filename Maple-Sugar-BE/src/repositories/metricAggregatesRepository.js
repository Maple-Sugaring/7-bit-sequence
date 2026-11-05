/**
 * Hourly reading aggregates and the retention runs that write them (BRU-007).
 *
 * Every SQL statement that decides which raw rows are compacted lives here,
 * next to the statement that reads them back, so the eligibility rule cannot
 * drift between the job and the queries.
 */

import { queryAll, queryOne } from '../db/pool.js';
import { AGGREGATE_PERIOD_SECONDS, AGGREGATED_FIELDS } from '../business/retention.js';
import { iso, num } from './mappers.js';

const PREFIXES = Object.values(AGGREGATED_FIELDS);

/**
 * A raw row the retention job may compact: a sensor sample (no user) that no
 * one corrected. Manual and corrected readings stay raw for provenance.
 */
export const ELIGIBLE_RAW = 'recorded_by_user_id is null and corrected_at is null and node_id is not null';

const AGGREGATE_COLUMNS = `
  id, node_id, bucket_id, period_start, period_seconds, reading_count,
  first_recorded_at, last_recorded_at, ice_present_count, created_at, updated_at, last_run_id,
  ${PREFIXES.map((p) => `${p}_count, ${p}_sum, ${p}_min, ${p}_max`).join(',\n  ')}
`;



function mapAggregateRow(row) {
  const counts = {};
  const averages = {};
  const minimums = {};
  const maximums = {};
  for (const [field, prefix] of Object.entries(AGGREGATED_FIELDS)) {
    const count = Number(row[`${prefix}_count`]) || 0;


    counts[field] = count;
    averages[field] = count ? num(row[`${prefix}_sum`]) / count : null;
    minimums[field] = num(row[`${prefix}_min`]);
    maximums[field] = num(row[`${prefix}_max`]);
  }
  const start = new Date(row.period_start);
  return { counts, averages, minimums, maximums, start, end: new Date(start.getTime() + row.period_seconds * 1000) };
}



/**
 * An aggregate in the same shape as a raw reading, so `GET /metrics` keeps
 * serving year comparisons and exports for compacted periods. Field values are
 * the period's averages. `Aggregate` says how many readings each one stands for.
 */
export function mapAggregateAsMetric(row) {
  const { counts, averages, minimums, maximums, start, end } = mapAggregateRow(row);
  return {
    MetricID: null,
    NodeID: row.node_id,
    BucketID: row.bucket_id,
    Recorded_By_UserID: null,
    Recorded_At: iso(start),
    Weight: averages.Weight,
    Temperature: averages.Temperature,
    Sugar_Percent: averages.Sugar_Percent,
    Weather_Conditions: null,
    Ice_Present: Number(row.ice_present_count) > 0,
    Sap_Flow_Rate_Lph: averages.Sap_Flow_Rate_Lph,
    Corrected_At: null,
    Corrected_By_UserID: null,
    Aggregated: true,
    Aggregate: {
      AggregateID: row.id,
      Period_Start: iso(start),
      Period_End: iso(end),
      Period_Seconds: row.period_seconds,
      Sample_Count: row.reading_count,
      First_Recorded_At: iso(row.first_recorded_at),
      Last_Recorded_At: iso(row.last_recorded_at),
      Ice_Present_Count: Number(row.ice_present_count) || 0,
      Counts: counts,
      Min: minimums,
      Max: maximums,
      Averaging: 'arithmetic mean of the readings in the period',
      Compacted_At: iso(row.updated_at),
      Run_ID: row.last_run_id ?? null,

    },
  };



}


export async function listAggregates({ nodeId, season, from, to } = {}) {
  const conditions = [];
  const values = [];
  if (nodeId != null) {
    values.push(nodeId);
    conditions.push(`node_id = $${values.length}`);
  }
  if (season != null) {
    values.push(season);
    conditions.push(`sap_season(period_start) = $${values.length}`);
  }
  if (from) {
    values.push(from);
    conditions.push(`period_start >= $${values.length}`);
  }


  if (to) {
    values.push(to);
    conditions.push(`period_start <= $${values.length}`);
  }


  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
  const rows = await queryAll(
    `select ${AGGREGATE_COLUMNS} from metric_aggregates ${where} order by period_start desc, id desc`,
    values,
  );
  return rows.map(mapAggregateAsMetric);


}

// --- Retention job -------------------------------------------------------

const insertColumns = [
  'node_id', 'bucket_id', 'period_start', 'period_seconds', 'reading_count',
  'first_recorded_at', 'last_recorded_at', 'ice_present_count', 'last_run_id',
  ...PREFIXES.flatMap((p) => [`${p}_count`, `${p}_sum`, `${p}_min`, `${p}_max`]),
];


// use epoh time
const selectAggregates = [
  'node_id',
  'bucket_id',

  `to_timestamp(floor(extract(epoch from recorded_at) / ${AGGREGATE_PERIOD_SECONDS}) * ${AGGREGATE_PERIOD_SECONDS})`,
  String(AGGREGATE_PERIOD_SECONDS),
  'count(*)',
  'min(recorded_at)',
  'max(recorded_at)',

  'count(*) filter (where ice_present)',
  '$3::integer',
  ...PREFIXES.flatMap((p) => [`count(${p})`, `sum(${p})`, `min(${p})`, `max(${p})`]),
];

// Late rows for a period that already has an aggregate are merged into it, so
// the job is safe to re-run and never needs to rebuild a period from scratch.
const mergeAssignments = [
  'reading_count = a.reading_count + excluded.reading_count',
  'first_recorded_at = least(a.first_recorded_at, excluded.first_recorded_at)',
  'last_recorded_at = greatest(a.last_recorded_at, excluded.last_recorded_at)',
  'ice_present_count = a.ice_present_count + excluded.ice_present_count',
  'last_run_id = excluded.last_run_id',
  'updated_at = CURRENT_TIMESTAMP',
  ...PREFIXES.flatMap((p) => [

    `${p}_count = a.${p}_count + excluded.${p}_count`,
    `${p}_sum = case when a.${p}_count + excluded.${p}_count = 0 then null
                     else coalesce(a.${p}_sum, 0) + coalesce(excluded.${p}_sum, 0) end`,
    `${p}_min = least(a.${p}_min, excluded.${p}_min)`,
    `${p}_max = greatest(a.${p}_max, excluded.${p}_max)`,
  ]),
];

/**
 * Moves every eligible raw row in [start, end) into aggregates in ONE
 * statement: the delete and the insert commit together or not at all, so a
 * crash can neither lose readings nor count them twice.
 */
const COMPACT_SQL = `
  with moved as (
    delete from metrics
     where ${ELIGIBLE_RAW}
       and recorded_at >= $1 and recorded_at < $2
     returning node_id, bucket_id, recorded_at, ice_present, ${PREFIXES.join(', ')}
  ),
  written as (
    insert into metric_aggregates as a (${insertColumns.join(', ')})
    select ${selectAggregates.join(',\n           ')}
      from moved
     group by 1, 2, 3
    on conflict (node_id, (coalesce(bucket_id, 0)), period_start, period_seconds)
    do update set ${mergeAssignments.join(',\n      ')}
    returning 1
  )
  select (select count(*) from moved) as rows_compacted,
         (select count(*) from written) as buckets_written
`;




export async function compactWindow(client, { start, end, runId }) {
  const { rows } = await client.query(COMPACT_SQL, [start, end, runId]);
  return {
    rowsCompacted: Number(rows[0].rows_compacted) || 0,
    bucketsWritten: Number(rows[0].buckets_written) || 0,
  };
}

export async function oldestEligibleBefore(client, cutoff) {
  const { rows } = await client.query(
    `select min(recorded_at) as oldest from metrics where ${ELIGIBLE_RAW} and recorded_at < $1`,
    [cutoff],
  );
  return rows[0]?.oldest ? new Date(rows[0].oldest) : null;
}

/** What a run would do, without changing anything. */
export async function previewCompaction(client, cutoff) {
  const { rows } = await client.query(
    `select count(*) as rows_eligible,
            count(distinct (node_id, coalesce(bucket_id, 0),
                            floor(extract(epoch from recorded_at) / ${AGGREGATE_PERIOD_SECONDS}))) as periods
       from metrics
      where ${ELIGIBLE_RAW} and recorded_at < $1`,
    [cutoff],
  );
  return { rowsEligible: Number(rows[0].rows_eligible) || 0, periods: Number(rows[0].periods) || 0 };
}

/**
 * Any run still marked running when a new run holds the lock was cut short
 * (process killed, host rebooted). Its committed windows are kept; the new run
 * continues from whatever is left.
 */
export async function markInterruptedRuns(client) {
  const { rowCount } = await client.query(
    `update metric_retention_runs
        set status = 'interrupted', finished_at = CURRENT_TIMESTAMP,
            error = coalesce(error, 'Run ended without finishing; the next run resumed it.')
      where status = 'running'`,
  );
  return rowCount;
}

export async function startRun(client, { trigger, dryRun, userId, retentionDays, cutoff }) {
  const { rows } = await client.query(
    `insert into metric_retention_runs
       (trigger, dry_run, triggered_by_user_id, raw_retention_days, period_seconds, cutoff)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [trigger, dryRun, userId ?? null, retentionDays, AGGREGATE_PERIOD_SECONDS, cutoff],
  );
  return rows[0].id;
}

export async function recordRunProgress(client, runId, { rowsCompacted, bucketsWritten }) {
  await client.query(
    `update metric_retention_runs
        set rows_compacted = rows_compacted + $2, buckets_written = buckets_written + $3
      where id = $1`,
    [runId, rowsCompacted, bucketsWritten],
  );
}

export async function finishRun(client, runId, { status, error = null, totals = null }) {
  await client.query(
    `update metric_retention_runs
        set status = $2, error = $3, finished_at = CURRENT_TIMESTAMP,
            rows_compacted = coalesce($4, rows_compacted),
            buckets_written = coalesce($5, buckets_written)
      where id = $1`,
    [runId, status, error, totals?.rowsCompacted ?? null, totals?.bucketsWritten ?? null],
  );
}




function mapRun(row) {
  return {
    RunID: row.id,
    Status: row.status,
    Trigger: row.trigger,
    Dry_Run: row.dry_run,
    Triggered_By_UserID: row.triggered_by_user_id,
    Raw_Retention_Days: row.raw_retention_days,
    Period_Seconds: row.period_seconds,
    Cutoff: iso(row.cutoff),
    Rows_Compacted: row.rows_compacted,
    Buckets_Written: row.buckets_written,
    Started_At: iso(row.started_at),
    Finished_At: iso(row.finished_at),
    Error: row.error ?? null,
  };
}

export async function listRuns(limit = 10) {
  const rows = await queryAll(
    'select * from metric_retention_runs order by started_at desc, id desc limit $1',
    [limit],
  );
  return rows.map(mapRun);
}

/** Row counts and on-disk sizes for the storage panel. */
export async function storageStats(cutoff) {
  const row = await queryOne(
    `select
       (select count(*) from metrics) as raw_rows,
       (select count(*) from metrics where recorded_by_user_id is not null) as manual_rows,
       (select count(*) from metrics where corrected_at is not null) as corrected_rows,
       (select count(*) from metrics where ${ELIGIBLE_RAW} and $1::timestamptz is not null
                                      and recorded_at < $1::timestamptz) as eligible_rows,
       (select min(recorded_at) from metrics) as oldest_raw,
       (select count(*) from metric_aggregates) as aggregate_rows,
       (select coalesce(sum(reading_count), 0) from metric_aggregates) as compacted_readings,
       (select min(period_start) from metric_aggregates) as oldest_aggregate,
       (select max(period_start) from metric_aggregates) as newest_aggregate,
       pg_total_relation_size('metrics') as raw_bytes,
       pg_total_relation_size('metric_aggregates') as aggregate_bytes`,
    [cutoff],
  );
  return row;
}

/**
 * The rollup behind GET /metrics/rollup: raw rows and hourly aggregates are
 * unioned as (count, sum, min, max) parts and regrouped by a local calendar
 * period, so every average is weighted by the readings it stands for.
 */
export async function rollup({ nodeId, season, from, to, interval, timeZone }) {
  const values = [interval, timeZone];
  const raw = [];
  const agg = [];
  if (nodeId != null) {
    values.push(nodeId);
    raw.push(`node_id = $${values.length}`);
    agg.push(`node_id = $${values.length}`);
  }
  if (season != null) {
    values.push(season);
    raw.push(`sap_season(recorded_at) = $${values.length}`);
    agg.push(`sap_season(period_start) = $${values.length}`);
  }
  if (from) {
    values.push(from);
    raw.push(`recorded_at >= $${values.length}`);
    agg.push(`period_start >= $${values.length}`);
  }
  if (to) {
    values.push(to);
    raw.push(`recorded_at <= $${values.length}`);
    agg.push(`period_start <= $${values.length}`);
  }
  const rawWhere = raw.length ? `where ${raw.join(' and ')}` : '';
  const aggWhere = agg.length ? `where ${agg.join(' and ')}` : '';

  const rawParts = PREFIXES.flatMap((p) => [
    `(${p} is not null)::int as ${p}_count`, `${p} as ${p}_sum`, `${p} as ${p}_min`, `${p} as ${p}_max`,
  ]);
  const aggParts = PREFIXES.flatMap((p) => [`${p}_count`, `${p}_sum`, `${p}_min`, `${p}_max`]);
  const regrouped = PREFIXES.flatMap((p) => [
    `sum(${p}_count) as ${p}_count`,
    `sum(${p}_sum) / nullif(sum(${p}_count), 0) as ${p}_avg`,
    `min(${p}_min) as ${p}_min`,
    `max(${p}_max) as ${p}_max`,
  ]);

  const rows = await queryAll(
    `with parts as (
       select node_id, recorded_at as at, 1 as n, ice_present::int as ice, 'raw' as source,
              ${rawParts.join(', ')}
         from metrics ${rawWhere}
       union all
       select node_id, period_start as at, reading_count as n, ice_present_count as ice, 'aggregate' as source,
              ${aggParts.join(', ')}
         from metric_aggregates ${aggWhere}
     ),
     grouped as (
       select node_id,
              date_trunc($1::text, at at time zone $2::text) as local_start,
              sum(n) as reading_count,
              coalesce(sum(n) filter (where source = 'raw'), 0) as raw_count,
              coalesce(sum(n) filter (where source = 'aggregate'), 0) as aggregated_count,
              sum(ice) as ice_present_count,
              min(at) as first_at,
              max(at) as last_at,
              ${regrouped.join(',\n              ')}
         from parts
        group by node_id, local_start
     )
     select *,
            (local_start at time zone $2::text) as period_start,
            ((local_start + ('1 ' || $1::text)::interval) at time zone $2::text) as period_end
       from grouped
      order by node_id, local_start`,
    values,
  );

  return rows.map((row) => {
    const out = {
      NodeID: row.node_id,
      Period_Start: iso(row.period_start),
      Period_End: iso(row.period_end),
      Interval: interval,
      Time_Zone: timeZone,
      Reading_Count: Number(row.reading_count),
      Raw_Count: Number(row.raw_count),
      Aggregated_Count: Number(row.aggregated_count),
      Ice_Present_Count: Number(row.ice_present_count) || 0,
      Counts: {},
      Average: {},
      Min: {},
      Max: {},
    };
    for (const [field, prefix] of Object.entries(AGGREGATED_FIELDS)) {
      out.Counts[field] = Number(row[`${prefix}_count`]) || 0;
      out.Average[field] = num(row[`${prefix}_avg`]);
      out.Min[field] = num(row[`${prefix}_min`]);
      out.Max[field] = num(row[`${prefix}_max`]);
    }
    return out;
  });
}
