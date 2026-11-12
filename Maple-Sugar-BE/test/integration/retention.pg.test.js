/**
 * BRU-007 against a real Postgres: compaction, boundaries, weighted rollups,
 * timezones, idempotency, interruption, locking and storage reporting.
 *
 * Skipped unless MAPLE_TEST_DATABASE_URL points at a throwaway database (see
 * test/pgEnv.js). Migrations are applied, then every test owns the metrics,
 * aggregate and run tables.
 */

import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import '../env.js';
import { testDatabaseUrl } from '../pgEnv.js';
import { closePool, pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { config } from '../../src/config.js';
import { runRetention, storageReport } from '../../src/services/metricRetention.js';
import * as metricsRepository from '../../src/repositories/metricsRepository.js';
import { createDeployedNode, deleteNode } from '../../src/repositories/nodesRepository.js';
import { deleteUser } from '../../src/repositories/usersRepository.js';
import { recordCollection } from '../../src/services/collectionsService.js';
import { ingestReadings } from '../../src/services/ingestService.js';
import { createReadingBuffer } from '../../src/services/readingBuffer.js';
import { updateMetric } from '../../src/services/metricsService.js';
import { createCollectionLog, listCollectionLogs } from '../../src/repositories/collectionLogsRepository.js';
import { rollup } from '../../src/repositories/metricAggregatesRepository.js';

const skip = testDatabaseUrl ? false : 'set MAPLE_TEST_DATABASE_URL to run';
const DAY_MS = 24 * 60 * 60 * 1000;

/** The `now` that puts the raw cutoff exactly at `cutoffIso`. */
function nowForCutoff(cutoffIso) {
  return new Date(new Date(cutoffIso).getTime() + config.metricsRawRetentionDays * DAY_MS);
}

let nodeA;
let nodeB;
let userId;

async function insertReading({ node = nodeA, at, weight = null, sugar = null, temp = null, user = null, ice = false }) {
  const { rows } = await pool.query(
    `insert into metrics (node_id, recorded_at, weight, sugar_percent, temperature, recorded_by_user_id, ice_present)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [node, at, weight, sugar, temp, user, ice],
  );
  return rows[0].id;
}

async function count(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return Number(rows[0].count);
}

describe('reading retention and aggregation (Postgres)', { skip }, () => {
  before(async () => {
    await runMigrations();
    const nodes = await pool.query('select id from node order by id limit 2');
    assert.equal(nodes.rows.length, 2, 'seed should provide at least two nodes');
    [nodeA, nodeB] = nodes.rows.map((row) => row.id);
    const user = await pool.query('select id from users order by id limit 1');
    userId = user.rows[0]?.id ?? null;
  });

  beforeEach(async () => {
    await pool.query('delete from metric_aggregates');
    await pool.query('delete from metric_retention_runs');
    await pool.query('delete from metrics');
  });

  after(() => closePool());

  test('compacts only sensor rows strictly before the hour-aligned cutoff', async () => {
    await insertReading({ at: '2025-03-10T09:59:59.999Z', weight: 10 });
    const atCutoff = await insertReading({ at: '2025-03-10T10:00:00.000Z', weight: 20 });

    const result = await runRetention({ now: nowForCutoff('2025-03-10T10:00:00Z') });

    assert.equal(result.Status, 'succeeded');
    assert.equal(result.Cutoff, '2025-03-10T10:00:00.000Z');
    assert.equal(result.Rows_Compacted, 1);
    assert.equal(result.Buckets_Written, 1);
    assert.equal(await count('select count(*) from metrics where id = $1', [atCutoff]), 1);

    const agg = (await pool.query('select * from metric_aggregates')).rows[0];
    assert.equal(agg.period_start.toISOString(), '2025-03-10T09:00:00.000Z');
    assert.equal(agg.reading_count, 1);
  });

  test('one concurrent correction wins and writes its audit note once', async () => {
    const id = await insertReading({ at: '2025-03-01T12:10:00Z', weight: 30 });
    const results = await Promise.allSettled([
      updateMetric(id, { Weight: 31 }, userId, 0, 'Tare correction'),
      updateMetric(id, { Weight: 32 }, userId, 0, 'Scale correction'),
    ]);
    const saved = results.find((result) => result.status === 'fulfilled').value;
    assert.equal(results.find((result) => result.status === 'rejected').reason.status, 409);
    assert.equal(saved.MetricID, id);
    assert.equal(saved.Revision, 1);
    assert.match(saved.Correction_Note, /30 lb → 3[12] lb/);
    assert.equal(await count("select count(*) from audit_events where target_id = $1 and event_type = 'measurement_overwritten'", [id]), 1);
    assert.equal((await metricsRepository.findMetricById(id)).Weight, saved.Weight);
  });

  test('a rejected audit insert rolls the measurement correction back', async () => {
    const id = await insertReading({ at: '2025-03-01T12:10:00Z', weight: 30 });
    await pool.query(`alter table audit_events add constraint reject_rehearsal_note
      check (note not like '%forced audit rejection%')`);
    try {
      await assert.rejects(
        updateMetric(id, { Weight: 31 }, userId, 0, 'forced audit rejection'),
        { code: '23514' },
      );
      const reading = await metricsRepository.findMetricById(id);
      assert.equal(reading.Weight, 30);
      assert.equal(reading.Revision, 0);
      assert.equal(reading.Correction_Note, null);
    } finally {
      await pool.query('alter table audit_events drop constraint reject_rehearsal_note');
    }
  });

  test('collection pages preserve equal-timestamp rows and stay in the active mode', async () => {
    const collectedAt = '2090-03-01T12:10:00Z';
    const entry = { NodeID: nodeA, Collected_At: collectedAt, Volume_Collected: 1 };
    const first = await createCollectionLog(entry);
    const second = await createCollectionLog(entry);
    try {
      const [newest] = await listCollectionLogs({ from: collectedAt, limit: 1 });
      assert.equal(newest.LogID, second.LogID);
      const [older] = await listCollectionLogs({ from: collectedAt, before: newest.LogID, limit: 1 });
      assert.equal(older.LogID, first.LogID);
      await pool.query("update site_data_mode set mode = 'production'");
      assert.deepEqual(await listCollectionLogs({ from: collectedAt }), []);
      assert.equal((await createCollectionLog(entry)).Data_Mode, 'production');
      assert.equal((await listCollectionLogs({ from: collectedAt })).length, 1);
    } finally {
      await pool.query("update site_data_mode set mode = 'test'");
      await pool.query('delete from collection_logs where collected_at = $1', [collectedAt]);
    }
  });

  test('queued writes use the mode at first save and retries keep that classification', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'maple-mode-'));
    const buffer = createReadingBuffer(join(dir, 'readings.jsonl'));
    const gateway = (await pool.query("insert into gateway (gateway_code) values ('MODE-REHEARSAL') returning id")).rows[0];
    const node = await createDeployedNode({ GatewayID: gateway.id, Node_Name: 'Mode rehearsal' }, userId);
    const recordedAt = new Date().toISOString();
    const collectedAt = new Date(Date.now() + 1000).toISOString();
    const batch = { gatewayCode: 'MODE-REHEARSAL', readings: [{ NodeID: node.NodeID, Recorded_At: recordedAt, Weight: 10 }] };
    const collection = { NodeID: node.NodeID, Client_Ref: randomUUID(), Collected_At: collectedAt, Weight: 11, Notes: 'Queued offline' };
    const user = { UserID: userId, RoleID: 1 };
    try {
      await buffer.enqueue(batch);
      await pool.query("update site_data_mode set mode = 'production'");
      assert.deepEqual(await buffer.flush(async (queued) => {
        const result = await ingestReadings(queued);
        assert.equal(result.Accepted[0].Reading.Data_Mode, 'production');
      }), { flushed: 1, remaining: 0 });
      const saved = await recordCollection(collection, user);
      assert.equal(saved.Entry.Data_Mode, 'production');
      assert.equal(saved.Log.Data_Mode, 'production');
      await pool.query("update site_data_mode set mode = 'test'");
      const retry = await ingestReadings(batch);
      assert.equal(retry.Accepted[0].Duplicate, true);
      assert.equal(retry.Accepted[0].Reading.Data_Mode, 'production');
      const repeated = await recordCollection(collection, user);
      assert.equal(repeated.Duplicate, true);
      assert.equal(repeated.Entry.EntryID, saved.Entry.EntryID);
      assert.equal(repeated.Entry.Data_Mode, 'production');
      assert.equal(await count("select count(*) from metrics where node_id = $1 and data_mode = 'production'", [node.NodeID]), 2);
      assert.equal(await count('select count(*) from collection_logs where node_id = $1', [node.NodeID]), 1);
    } finally {
      await pool.query("update site_data_mode set mode = 'test'");
      await pool.query('delete from collection_logs where node_id = $1', [node.NodeID]);
      await deleteNode(node.NodeID);
      await pool.query('delete from gateway where id = $1', [gateway.id]);
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('keeps manual and corrected readings raw for provenance', async () => {
    const manual = await insertReading({ at: '2025-03-01T12:10:00Z', sugar: 2.5, user: userId });
    const corrected = await insertReading({ at: '2025-03-01T12:20:00Z', weight: 30 });
    await metricsRepository.updateMetric(corrected, { Weight: 31 }, userId);
    await insertReading({ at: '2025-03-01T12:30:00Z', weight: 40 });

    const result = await runRetention({ now: nowForCutoff('2025-04-01T00:00:00Z') });
    assert.equal(result.Rows_Compacted, 1);

    const kept = await metricsRepository.findMetricById(corrected);
    assert.equal(kept.Weight, 31);
    assert.ok(kept.Corrected_At, 'correction time is stamped');
    assert.equal(kept.Corrected_By_UserID, userId);
    assert.ok(await metricsRepository.findMetricById(manual));
  });

  test('keeps manual readings raw after their author is deleted', async () => {
    const { rows: [user] } = await pool.query(
      "insert into users (email, role_id) values ('retention-test@g.rit.edu', 2) returning id",
    );
    const manual = await insertReading({ at: '2025-03-01T12:10:00Z', sugar: 2.5, user: user.id });
    assert.equal(await deleteUser(user.id), true);
    assert.equal((await metricsRepository.findMetricById(manual)).Recorded_By_UserID, null);

    const result = await runRetention({ now: nowForCutoff('2025-04-01T00:00:00Z') });
    assert.equal(result.Rows_Compacted, 0);
    assert.equal((await metricsRepository.findMetricById(manual)).Sugar_Percent, 2.5);
    assert.equal((await storageReport()).Raw.Manual_Rows, 1);
  });

  test('deleting a node removes compacted metrics and preserves collection logs', async () => {
    const node = await createDeployedNode({ Node_Name: 'Retention deletion test', Stand: 'Alumni House' });
    const reading = await insertReading({ node: node.NodeID, at: '2025-03-01T12:10:00Z', weight: 20 });
    await pool.query('update metrics set bucket_id = (select id from buckets where node_id = $1) where id = $2',
      [node.NodeID, reading]);
    await runRetention({ now: nowForCutoff('2025-04-01T00:00:00Z') });
    assert.equal(await count('select count(*) from metric_aggregates where node_id = $1', [node.NodeID]), 1);

    const log = await createCollectionLog({ NodeID: node.NodeID, Volume_Collected: 1 });
    try {
      assert.equal(await deleteNode(node.NodeID), true);
      assert.equal(await count('select count(*) from collection_logs where id = $1', [log.LogID]), 1);
    } finally {
      await pool.query('delete from collection_logs where id = $1', [log.LogID]);
    }
    assert.equal(await count('select count(*) from metric_aggregates where node_id = $1', [node.NodeID]), 0);
    assert.equal(await count('select count(*) from node where id = $1', [node.NodeID]), 0);
  });

  test('is idempotent and merges late readings into an existing period', async () => {
    await insertReading({ at: '2025-02-01T05:05:00Z', weight: 10 });
    await insertReading({ at: '2025-02-01T05:15:00Z', weight: 20 });
    const now = nowForCutoff('2025-03-01T00:00:00Z');

    assert.equal((await runRetention({ now })).Rows_Compacted, 2);
    const again = await runRetention({ now });
    assert.equal(again.Rows_Compacted, 0);
    assert.equal(again.Buckets_Written, 0);

    // A late sample for an hour that is already compacted.
    await insertReading({ at: '2025-02-01T05:45:00Z', weight: 60 });
    assert.equal((await runRetention({ now })).Rows_Compacted, 1);

    const rows = (await pool.query('select * from metric_aggregates')).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reading_count, 3);
    assert.equal(rows[0].weight_count, 3);
    assert.equal(Number(rows[0].weight_sum), 90);
    assert.equal(Number(rows[0].weight_min), 10);
    assert.equal(Number(rows[0].weight_max), 60);
    assert.equal(rows[0].last_recorded_at.toISOString(), '2025-02-01T05:45:00.000Z');
  });

  test('groups by node and keeps missing fields as zero counts, not zeros', async () => {
    await insertReading({ node: nodeA, at: '2025-01-05T14:01:00Z', weight: 12, sugar: null });
    await insertReading({ node: nodeA, at: '2025-01-05T14:02:00Z', weight: null, sugar: 2 });
    await insertReading({ node: nodeB, at: '2025-01-05T14:03:00Z', weight: 50, ice: true });

    await runRetention({ now: nowForCutoff('2025-02-01T00:00:00Z') });


    
    const listed = await metricsRepository.listMetrics({ nodeId: nodeA });
    assert.equal(listed.length, 1);
    const [row] = listed;
    assert.equal(row.Aggregated, true);
    assert.equal(row.MetricID, null);
    assert.equal(row.Weight, 12);
    assert.equal(row.Sugar_Percent, 2);
    assert.equal(row.Temperature, null);
    assert.equal(row.Aggregate.Sample_Count, 2);
    assert.deepEqual(row.Aggregate.Counts, { Weight: 1, Temperature: 0, Sugar_Percent: 1, Sap_Flow_Rate_Lph: 0 });
    assert.equal(row.Aggregate.Period_Start, '2025-01-05T14:00:00.000Z');
    assert.equal(row.Aggregate.Period_End, '2025-01-05T15:00:00.000Z');



    const [other] = await metricsRepository.listMetrics({ nodeId: nodeB });
    assert.equal(other.Ice_Present, true);
    assert.equal(other.Aggregate.Ice_Present_Count, 1);

    assert.equal((await metricsRepository.listMetrics({ nodeId: nodeA, aggregates: false })).length, 0);
  });

  test('a query spanning the raw/aggregate boundary returns both without overlap', async () => {
    await insertReading({ at: '2025-06-01T08:10:00Z', weight: 10 });
    await insertReading({ at: '2025-06-01T08:50:00Z', weight: 30 });
    await insertReading({ at: '2025-06-01T09:10:00Z', weight: 99 });

    await runRetention({ now: nowForCutoff('2025-06-01T09:00:00Z') });

    const rows = await metricsRepository.listMetrics({
      nodeId: nodeA,
      from: '2025-06-01T00:00:00Z',
      to: '2025-06-01T23:59:59Z',
    });
    assert.deepEqual(
      rows.map((row) => [row.Recorded_At, row.Aggregated, row.Weight]),
      [
        ['2025-06-01T09:10:00.000Z', false, 99],
        ['2025-06-01T08:00:00.000Z', true, 20],
      ],
    );

    const late = await metricsRepository.listMetrics({ nodeId: nodeA, from: '2025-06-01T08:30:00Z' });
    assert.deepEqual(late.map((row) => row.Aggregated), [false]);
  });

  test('a list keeps one snapshot when compaction commits between its two reads', async (t) => {
    await insertReading({ at: '2025-03-01T12:10:00Z', weight: 10 });
    await insertReading({ at: '2025-03-01T12:20:00Z', weight: 30 });
    const connect = pool.connect.bind(pool);
    let intercepted = false;
    let compacted = false;
    t.mock.method(pool, 'connect', async () => {
      const client = await connect();
      if (intercepted) return client;
      intercepted = true;
      const query = client.query.bind(client);
      t.mock.method(client, 'query', async (sql, params) => {
        const result = await query(sql, params);
        if (String(sql).includes('from metrics') && String(sql).includes('order by recorded_at')) {
          const run = await runRetention({ now: nowForCutoff('2025-04-01T00:00:00Z') });
          assert.equal(run.Rows_Compacted, 2);
          compacted = true;
        }
        return result;
      });
      return client;
    });

    const listed = await metricsRepository.listMetrics({ nodeId: nodeA });
    assert.equal(compacted, true, 'retention committed after raw rows were read');
    assert.equal(listed.reduce((n, row) => n + (row.Aggregate?.Sample_Count ?? 1), 0), 2);
    assert.deepEqual(listed.map((row) => row.Weight), [30, 10]);
    t.mock.restoreAll();
    assert.equal(await count('select count(*) from metrics'), 0);
  });

  test('season filters follow the same UTC boundary for aggregates', async () => {
    await insertReading({ at: '2026-06-30T23:30:00Z', weight: 10 });
    await insertReading({ at: '2026-07-01T00:30:00Z', weight: 20 });
    await runRetention({ now: nowForCutoff('2026-08-01T00:00:00Z') });

    const s2026 = await metricsRepository.listMetrics({ season: 2026 });
    const s2027 = await metricsRepository.listMetrics({ season: 2027 });
    assert.deepEqual(s2026.map((row) => row.Weight), [10]);
    assert.deepEqual(s2027.map((row) => row.Weight), [20]);
  });



  test('day rollups weight each hour by its reading count', async () => {
    await insertReading({ at: '2025-03-20T13:00:00Z', weight: 10 });
    await insertReading({ at: '2025-03-20T13:20:00Z', weight: 20 });
    await insertReading({ at: '2025-03-20T13:40:00Z', weight: 30 });
    await insertReading({ at: '2025-03-20T14:30:00Z', weight: 100 });
    await insertReading({ at: '2025-03-20T20:00:00Z', weight: 40 });

    await runRetention({ now: nowForCutoff('2025-03-20T15:00:00Z') });

    const [day] = await rollup({ nodeId: nodeA, interval: 'day', timeZone: 'America/New_York' });
    assert.equal(day.Reading_Count, 5);
    assert.equal(day.Raw_Count, 1);
    assert.equal(day.Aggregated_Count, 4);
    assert.equal(day.Average.Weight, 40);
    assert.equal(day.Min.Weight, 10);
    assert.equal(day.Max.Weight, 100);
    assert.equal(day.Counts.Sugar_Percent, 0);
    assert.equal(day.Average.Sugar_Percent, null);
  });

  test('local day rollups respect DST and timezone day boundaries', async () => {
    await insertReading({ at: '2026-03-08T04:30:00Z', weight: 1 }); 
    await insertReading({ at: '2026-03-08T05:30:00Z', weight: 2 }); 
    await insertReading({ at: '2026-03-09T03:30:00Z', weight: 4 }); 
    await insertReading({ at: '2026-03-09T04:30:00Z', weight: 8 });
    await runRetention({ now: nowForCutoff('2026-04-01T00:00:00Z') });

    const days = await rollup({ nodeId: nodeA, interval: 'day', timeZone: 'America/New_York' });
    assert.deepEqual(
      days.map((d) => [d.Period_Start, d.Period_End, d.Reading_Count, d.Average.Weight]),
      [
        ['2026-03-07T05:00:00.000Z', '2026-03-08T05:00:00.000Z', 1, 1],
        ['2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z', 2, 3],
        ['2026-03-09T04:00:00.000Z', '2026-03-10T04:00:00.000Z', 1, 8],
      ],
    );

    const utcDays = await rollup({ nodeId: nodeA, interval: 'day', timeZone: 'UTC' });
    assert.deepEqual(utcDays.map((d) => d.Reading_Count), [2, 2]);
  });

  test('hour rollups keep both instances of the repeated fall-back hour', async () => {
    await insertReading({ at: '2025-11-02T05:30:00Z', weight: 10 });
    await insertReading({ at: '2025-11-02T06:30:00Z', weight: 30 });
    const expected = [
      ['2025-11-02T05:00:00.000Z', '2025-11-02T06:00:00.000Z', 1, 10],
      ['2025-11-02T06:00:00.000Z', '2025-11-02T07:00:00.000Z', 1, 30],
    ];
    const hours = () => rollup({ nodeId: nodeA, interval: 'hour', timeZone: 'America/New_York' });
    const fields = (rows) => rows.map((h) => [h.Period_Start, h.Period_End, h.Reading_Count, h.Average.Weight]);
    assert.deepEqual(fields(await hours()), expected);
    await runRetention({ now: nowForCutoff('2025-12-01T00:00:00Z') });
    assert.deepEqual(fields(await hours()), expected);
  });



  test('a run left running is marked interrupted and the work resumes', async () => {
    await insertReading({ at: '2025-01-01T01:00:00Z', weight: 5 });
    await pool.query(
      `insert into metric_retention_runs (trigger, raw_retention_days, period_seconds, cutoff, status)
       values ('schedule', 400, 3600, '2025-02-01T00:00:00Z', 'running')`,
    );

    const result = await runRetention({ now: nowForCutoff('2025-02-01T00:00:00Z') });
    assert.equal(result.Rows_Compacted, 1);

    const statuses = (await pool.query('select status from metric_retention_runs order by id')).rows;
    assert.deepEqual(statuses.map((row) => row.status), ['interrupted', 'succeeded']);
  });



  test('a second concurrent run is skipped rather than double-processing', async () => {
    const holder = await pool.connect();
    try {
      await holder.query('select pg_advisory_lock($1)', [0x42525537]);
      const result = await runRetention({ now: nowForCutoff('2025-02-01T00:00:00Z') });
      assert.equal(result.Status, 'skipped');
    } finally {
      await holder.query('select pg_advisory_unlock($1)', [0x42525537]);
      holder.release();
    }
  });

  test('dry run reports eligible rows and changes nothing', async () => {
    await insertReading({ at: '2025-01-01T01:00:00Z', weight: 5 });
    await insertReading({ at: '2025-01-01T01:30:00Z', weight: 6 });
    await insertReading({ at: '2025-01-01T03:00:00Z', weight: 7 });

    const result = await runRetention({ dryRun: true, now: nowForCutoff('2025-02-01T00:00:00Z') });
    assert.equal(result.Rows_Eligible, 3);
    assert.equal(result.Periods_Affected, 2);
    assert.equal(await count('select count(*) from metrics'), 3);
    assert.equal(await count('select count(*) from metric_aggregates'), 0);
  });

  test('demonstrates storage reduction on a season of 1-minute samples', async () => {
    await pool.query(
      `insert into metrics (node_id, recorded_at, weight)
       select $1, ts, 20 + (extract(minute from ts)::int % 10)
         from generate_series('2025-03-01T00:00:00Z'::timestamptz,
                              '2025-03-30T23:59:00Z'::timestamptz, interval '1 minute') as ts`,
      [nodeA],
    );
    const before = await pool.query(
      "select avg(weight) as avg, count(*) as n, pg_total_relation_size('metrics') as bytes from metrics",
    );
    const { avg: rawAvg, n: rawCount } = before.rows[0];

    const result = await runRetention({ now: nowForCutoff('2025-04-01T00:00:00Z') });
    assert.equal(result.Rows_Compacted, Number(rawCount));
    assert.equal(result.Buckets_Written, 30 * 24);

    // The season average from the compacted data equals the raw average.
    const [month] = await rollup({ nodeId: nodeA, interval: 'month', timeZone: 'UTC' });
    assert.equal(month.Reading_Count, Number(rawCount));
    assert.ok(Math.abs(month.Average.Weight - Number(rawAvg)) < 1e-9);

    await pool.query('vacuum full metrics');
    const report = await storageReport(nowForCutoff('2025-04-01T00:00:00Z'));
    assert.equal(report.Raw.Rows, 0);
    assert.equal(report.Aggregates.Rows, 720);
    assert.equal(report.Aggregates.Readings_Represented, Number(rawCount));
    assert.equal(report.Compression_Ratio, 60);
    assert.ok(report.Aggregates.Bytes < Number(before.rows[0].bytes) / 5, 'aggregates are far smaller than raw');
    assert.equal(report.Recent_Runs[0].Rows_Compacted, Number(rawCount));
  });
});
