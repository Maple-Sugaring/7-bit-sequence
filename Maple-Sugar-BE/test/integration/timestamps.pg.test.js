/**
 * FR-036 against a real Postgres: a node measures offline, the gateway posts
 * late (or the API buffers and replays), a user reads the data, and an admin
 * traces the read and every automatic step back to the same reading.
 *
 * Skipped unless MAPLE_TEST_DATABASE_URL points at a throwaway database (see
 * test/pgEnv.js).
 */

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
import * as metricsRepository from '../../src/repositories/metricsRepository.js';
import { createDeployedNode } from '../../src/repositories/nodesRepository.js';
import { ingestReadings } from '../../src/services/ingestService.js';
import { createReadingBuffer } from '../../src/services/readingBuffer.js';
import { createMetric, listMetrics, updateMetric } from '../../src/services/metricsService.js';
import { listActivity, recordActivity, traceMetric } from '../../src/services/activityService.js';
import { activityPruneJob, replayBuffer, retentionJob } from '../../src/services/housekeeping.js';

const skip = testDatabaseUrl ? false : 'set MAPLE_TEST_DATABASE_URL to run';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const GATEWAY = 'FR036-GW';

let nodeId;
let userId;

/** The same instant written with a New York offset, as a client might send it. */
function newYorkIso(date) {
  const shifted = new Date(date.getTime() - 5 * HOUR_MS);
  return `${shifted.toISOString().slice(0, 19)}-05:00`;
}

function operations(events) {
  return events.map((event) => event.Operation);
}

describe('operation timestamps and activity trace (Postgres)', { skip }, () => {
  before(async () => {
    await runMigrations();
    await pool.query("update site_data_mode set mode = 'test'");
    await pool.query('insert into gateway (gateway_code) values ($1) on conflict do nothing', [GATEWAY]);
    const gateway = (await pool.query('select id from gateway where gateway_code = $1', [GATEWAY])).rows[0];
    const user = await pool.query('select id from users order by id limit 1');
    userId = user.rows[0]?.id ?? null;
    nodeId = (await createDeployedNode({ GatewayID: gateway.id, Node_Name: 'FR-036 maple' }, userId)).NodeID;
  });

  beforeEach(async () => {
    await pool.query('delete from activity_events');
    await pool.query('delete from metric_aggregates');
    await pool.query('delete from metric_retention_runs');
    await pool.query('delete from metrics where node_id = $1', [nodeId]);
  });

  after(() => closePool());

  test('offline node → late gateway post → user read → admin trace of the same reading', async () => {
    const measured = new Date(Date.now() - 6 * HOUR_MS);
    measured.setUTCMilliseconds(0);
    const receivedAt = new Date(Date.now() - 1000);

    const result = await ingestReadings({
      gatewayCode: GATEWAY,
      readings: [{ NodeID: nodeId, Recorded_At: newYorkIso(measured), Weight: 20 }],
      receivedAt,
      requestId: 'gw-post-000001',
    });
    const stored = result.Accepted[0].Reading;

    // Measurement time survives the delay and is stored as UTC.
    assert.equal(stored.Recorded_At, measured.toISOString());
    assert.equal(stored.Received_At, receivedAt.toISOString());
    assert.ok(new Date(stored.Created_At) >= receivedAt, 'written after receipt');
    assert.ok(new Date(stored.Created_At) - receivedAt < 60_000, 'written promptly');

    const rows = await listMetrics({ nodeId }, { requestId: 'ui-read-000001', actorUserId: userId, receivedAt: new Date() });
    const seen = rows.find((row) => row.MetricID === stored.MetricID);
    assert.equal(seen.Recorded_At, stored.Recorded_At);
    assert.equal(seen.Received_At, stored.Received_At);

    const trace = await traceMetric(stored.MetricID);
    assert.equal(trace.Reading.Status, 'stored');
    assert.equal(trace.Reading.Source, 'sensor');
    assert.equal(trace.Reading.Request_ID, 'gw-post-000001');
    assert.ok(Math.abs(trace.Reading.Ingest_Delay_Seconds - 6 * 3600) < 5);
    assert.deepEqual(operations(trace.Activity), ['metric.create', 'ingest.batch', 'metrics.list']);

    const [create, batch, read] = trace.Activity;
    assert.equal(create.Entity_ID, stored.MetricID);
    assert.equal(create.Detail.recorded_at, stored.Recorded_At);
    assert.equal(batch.Kind, 'ingest');
    assert.equal(batch.Request_ID, 'gw-post-000001');
    assert.deepEqual(batch.Detail.metric_ids, [stored.MetricID]);
    assert.equal(read.Request_ID, 'ui-read-000001');
    assert.equal(read.Actor_UserID, userId);
    assert.equal(read.NodeID, nodeId);
    // Reading values are never copied into the trace.
    assert.doesNotMatch(JSON.stringify(trace.Activity), /"Weight"|"weight"/);
  });

  test('a read that did not include the reading is not on its trace', async () => {
    const stored = (await ingestReadings({
      gatewayCode: GATEWAY,
      readings: [{ NodeID: nodeId, Recorded_At: new Date(Date.now() - 2 * HOUR_MS).toISOString(), Weight: 20 }],
      requestId: 'gw-post-000002',
    })).Accepted[0].Reading;

    await listMetrics({ nodeId, to: new Date(Date.now() - 3 * HOUR_MS).toISOString() }, { requestId: 'ui-read-older' });
    await listMetrics({ nodeId }, { requestId: 'ui-read-all' });

    const reads = (await traceMetric(stored.MetricID)).Activity.filter((event) => event.Kind === 'read');
    assert.deepEqual(reads.map((event) => event.Request_ID), ['ui-read-all']);
  });

  test('a batch buffered while Postgres was down keeps its original receipt time on replay', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fr036-buffer-'));
    try {
      const buffer = createReadingBuffer(join(dir, 'readings.jsonl'));
      const measured = new Date(Date.now() - 3 * HOUR_MS).toISOString();
      const receivedAt = new Date(Date.now() - 2 * HOUR_MS).toISOString();
      // What routes/ingest.js writes when the insert fails with a connection error.
      await buffer.enqueue({
        gatewayCode: GATEWAY,
        readings: [{ NodeID: nodeId, Recorded_At: measured, Weight: 22 }],
        receivedAt,
        requestId: 'gw-post-buffered',
      });

      assert.deepEqual(await replayBuffer(buffer), { flushed: 1, remaining: 0 });

      const [row] = await listMetrics({ nodeId });
      assert.equal(row.Recorded_At, measured);
      assert.equal(row.Received_At, receivedAt, 'replay time must not replace receipt time');
      assert.ok(new Date(row.Created_At) > new Date(receivedAt), 'the write happened at replay');

      const trace = await traceMetric(row.MetricID);
      const batch = trace.Activity.find((event) => event.Operation === 'ingest.batch');
      assert.equal(batch.Request_ID, 'gw-post-buffered');
      assert.equal(batch.Detail.source, 'buffer_replay');
      assert.equal(batch.Received_At, receivedAt);
      assert.ok(Math.abs(trace.Reading.Ingest_Delay_Seconds - 3600) < 5);

      const jobs = await listActivity({ kind: 'job', operation: 'ingest.buffer_replay' });
      assert.equal(jobs.items.length, 1);
      assert.equal(jobs.items[0].Row_Count, 1);

      // An empty buffer is a quiet tick, not a new row every minute.
      await replayBuffer(buffer);
      assert.equal((await listActivity({ kind: 'job', operation: 'ingest.buffer_replay' })).items.length, 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('a gateway retry keeps the first receipt time and is traced as a duplicate', async () => {
    const reading = { NodeID: nodeId, Recorded_At: new Date(Date.now() - HOUR_MS).toISOString(), Weight: 20 };
    const firstAt = new Date(Date.now() - 30_000);
    const first = await ingestReadings({ gatewayCode: GATEWAY, readings: [reading], receivedAt: firstAt, requestId: 'gw-try-0000001' });
    const retry = await ingestReadings({ gatewayCode: GATEWAY, readings: [reading], requestId: 'gw-try-0000002' });

    assert.equal(retry.Accepted[0].Duplicate, true);
    assert.equal(retry.Accepted[0].Reading.MetricID, first.Accepted[0].Reading.MetricID);
    assert.equal(retry.Accepted[0].Reading.Received_At, firstAt.toISOString());

    const trace = await traceMetric(first.Accepted[0].Reading.MetricID);
    const duplicate = trace.Activity.find((event) => event.Operation === 'metric.duplicate');
    assert.equal(duplicate.Outcome, 'skipped');
    assert.equal(duplicate.Request_ID, 'gw-try-0000002');
    assert.equal(duplicate.Detail.first_received_at, firstAt.toISOString());
    assert.ok(new Date(duplicate.Detail.retry_received_at) > firstAt);
  });

  test('a rejected batch is recorded with the reason code, not the payload', async () => {
    const future = new Date(Date.now() + DAY_MS).toISOString();
    const result = await ingestReadings({
      gatewayCode: GATEWAY,
      readings: [{ NodeID: nodeId, Recorded_At: future, Weight: 20 }],
      requestId: 'gw-post-future',
    });
    assert.equal(result.Accepted.length, 0);
    const [batch] = (await listActivity({ requestId: 'gw-post-future' })).items;
    assert.equal(batch.Outcome, 'rejected');
    assert.deepEqual(batch.Detail.rejected_codes, ['VALIDATION']);
    assert.equal(batch.Detail.metric_ids.length, 0);
  });

  test('UTC storage does not depend on the database session time zone', async () => {
    const client = await pool.connect();
    try {
      await client.query("set time zone 'America/New_York'");
      // 03:00 EDT, the first instant after the 2026 spring-forward gap.
      const reading = await metricsRepository.createMetric(
        { NodeID: nodeId, Recorded_At: '2026-03-08T03:00:00-04:00', Weight: 20, Received_At: '2026-03-08T07:00:05Z' },
        client,
      );
      assert.equal(reading.Recorded_At, '2026-03-08T07:00:00.000Z');
      assert.equal(reading.Received_At, '2026-03-08T07:00:05.000Z');
      const { rows } = await client.query(
        "select to_char(recorded_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as utc from metrics where id = $1",
        [reading.MetricID],
      );
      assert.equal(rows[0].utc, '2026-03-08 07:00');
    } finally {
      await client.query('reset time zone');
      client.release();
    }
  });

  test('a manual entry with no time is measured, received and written at receipt', async () => {
    const receivedAt = new Date(Date.now() - 2000);
    receivedAt.setUTCMilliseconds(0);
    const reading = await createMetric({ NodeID: nodeId, Weight: 20 }, userId, {
      requestId: 'ui-post-000001',
      receivedAt,
      source: 'manual',
    });
    assert.equal(reading.Recorded_At, receivedAt.toISOString());
    assert.equal(reading.Received_At, receivedAt.toISOString());
    const trace = await traceMetric(reading.MetricID);
    assert.equal(trace.Reading.Source, 'manual');
    assert.equal(trace.Activity[0].Actor_UserID, userId);
    assert.equal(trace.Activity[0].Detail.source, 'manual');
  });

  test('a correction is traced with field names and times; the reason stays in the audit trail', async () => {
    const reading = (await ingestReadings({
      gatewayCode: GATEWAY,
      readings: [{ NodeID: nodeId, Recorded_At: new Date(Date.now() - HOUR_MS).toISOString(), Weight: 20 }],
    })).Accepted[0].Reading;

    const corrected = await updateMetric(reading.MetricID, { Weight: 21 }, userId, 0, 'Scale was off by a pound', {
      requestId: 'ui-fix-0000001',
      receivedAt: new Date(),
    });

    assert.equal(corrected.Recorded_At, reading.Recorded_At, 'measurement time unchanged');
    assert.equal(corrected.Received_At, reading.Received_At, 'receipt time unchanged');
    assert.ok(corrected.Corrected_At);

    const trace = await traceMetric(reading.MetricID);
    const fix = trace.Activity.find((event) => event.Operation === 'metric.correct');
    assert.equal(fix.Request_ID, 'ui-fix-0000001');
    assert.deepEqual(fix.Detail.fields, ['Weight']);
    assert.equal(fix.Detail.corrected_at, corrected.Corrected_At);
    assert.doesNotMatch(JSON.stringify(fix), /Scale was off/);
    assert.match(trace.Audit[0].note, /Scale was off/);
  });

  test('a reading the retention job compacted still has a trace to its run', async () => {
    if (!config.metricsRawRetentionDays) return;
    const reading = await createMetric({ NodeID: nodeId, Recorded_At: '2025-03-10T09:30:00Z', Weight: 20 }, null, {
      requestId: 'gw-old-0000001',
      receivedAt: new Date('2025-03-10T09:31:00Z'),
      source: 'gateway',
    });

    const now = new Date(new Date('2025-03-10T10:00:00Z').getTime() + config.metricsRawRetentionDays * DAY_MS);
    const run = await retentionJob({ now });
    assert.equal(run.Status, 'succeeded');
    assert.ok(run.Rows_Compacted >= 1);

    const trace = await traceMetric(reading.MetricID);
    assert.equal(trace.Reading.Status, 'compacted');
    assert.equal(trace.Reading.Recorded_At, '2025-03-10T09:30:00.000Z');
    assert.equal(trace.Reading.Received_At, '2025-03-10T09:31:00.000Z');
    assert.equal(trace.Compaction.Run_ID, run.RunID);
    assert.equal(trace.Compaction.Period_Start, '2025-03-10T09:00:00.000Z');
    const job = trace.Activity.find((event) => event.Operation === 'retention.run');
    assert.equal(job.Kind, 'job');
    assert.equal(job.Detail.run_id, run.RunID);
    assert.ok(job.Duration_Ms >= 0);
  });

  test('activity older than the retention window is pruned; the audit trail is not', async () => {
    const auditBefore = Number((await pool.query('select count(*) from audit_events')).rows[0].count);
    await pool.query(
      "insert into activity_events (kind, operation, occurred_at) values ('read', 'metrics.list', $1), ('read', 'metrics.list', $2)",
      [new Date(Date.now() - (config.activityRetentionDays + 1) * DAY_MS), new Date(Date.now() - DAY_MS)],
    );

    const result = await activityPruneJob();
    assert.equal(result.Deleted, 1);

    const left = await listActivity({ operation: 'metrics.list' });
    assert.equal(left.items.length, 1);
    const [job] = (await listActivity({ operation: 'activity.prune' })).items;
    assert.equal(job.Row_Count, 1);
    assert.equal(Number((await pool.query('select count(*) from audit_events')).rows[0].count), auditBefore);
  });

  test('the activity list filters and pages newest first', async () => {
    for (let index = 0; index < 5; index += 1) {
      await recordActivity({ kind: 'read', operation: 'metrics.list', requestId: `page-test-${index}`, nodeId });
    }
    await recordActivity({ kind: 'job', operation: 'activity.prune' });

    const first = await listActivity({ kind: 'read', nodeId, limit: 2 });
    assert.deepEqual(first.items.map((item) => item.Request_ID), ['page-test-4', 'page-test-3']);
    const second = await listActivity({ kind: 'read', nodeId, limit: 2, before: first.next });
    assert.deepEqual(second.items.map((item) => item.Request_ID), ['page-test-2', 'page-test-1']);
    assert.ok(first.items.every((item) => item.Occurred_At.endsWith('Z')));
  });
});
