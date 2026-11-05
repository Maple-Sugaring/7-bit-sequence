/**
 * The retention job (BRU-007): folds sensor readings older than the raw
 * retention window into hourly aggregates.
 *
 * Safe to run at any time, from any replica, as often as you like:
 *   - A Postgres advisory lock means only one run works at a time across every
 *     API process. A second caller gets `skipped` instead of waiting.
 *   - Each UTC day is one statement that deletes the raw rows and upserts their
 *     aggregates together, so a crash loses nothing and counts nothing twice.
 *   - A run left `running` by a killed process is marked `interrupted` by the
 *     next run, which then carries on from whatever was not yet committed.
 *   - Re-running with nothing eligible is a no-op.
 */

import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { cacheNamespaces } from '../cache/cacheKeys.js';
import { invalidateNamespaces } from '../cache/redisCache.js';
import {
  AGGREGATE_PERIOD_SECONDS,
  compactionWindows,
  rawCutoff,
} from '../business/retention.js';
import * as aggregatesRepository from '../repositories/metricAggregatesRepository.js';

// Arbitrary but fixed: "BRU7" in ASCII. Shared by every replica.
const LOCK_KEY = 0x42525537;

export function retentionPolicy(now = new Date()) {
  const days = config.metricsRawRetentionDays;
  const cutoff = rawCutoff(now, days);
  return {
    Enabled: cutoff != null,
    Raw_Retention_Days: days,
    Aggregate_Retention: 'indefinite',
    Period_Seconds: AGGREGATE_PERIOD_SECONDS,
    Period_Alignment: 'UTC hour',
    Cutoff: cutoff ? cutoff.toISOString() : null,
    Fields: ['Weight', 'Temperature', 'Sugar_Percent', 'Sap_Flow_Rate_Lph'],
    Kept_Per_Field: ['count', 'sum', 'min', 'max'],
    Kept_Per_Period: ['reading_count', 'first_recorded_at', 'last_recorded_at', 'ice_present_count'],
    Never_Aggregated: ['manual readings (including those whose author was deleted)', 'corrected readings (Corrected_At set)'],
    Averaging: 'Arithmetic mean of the readings in the period; rollups weight each period by its reading count.',
  };
}

/**
 * @param {object} options
 * @param {'schedule'|'manual'} [options.trigger]
 * @param {number|null} [options.userId] who asked, for a manual run
 * @param {boolean} [options.dryRun] report what would move without moving it
 * @param {Date} [options.now]
 */
export async function runRetention({ trigger = 'schedule', userId = null, dryRun = false, now = new Date() } = {}) {
  const days = config.metricsRawRetentionDays;
  const cutoff = rawCutoff(now, days);
  if (!cutoff) return { Status: 'disabled', Raw_Retention_Days: days };

  const client = await pool.connect();
  let locked = false;
  try {
    const { rows } = await client.query('select pg_try_advisory_lock($1) as locked', [LOCK_KEY]);
    locked = rows[0].locked;
    if (!locked) {
      return { Status: 'skipped', Reason: 'Another retention run is in progress.', Cutoff: cutoff.toISOString() };
    }

    const interrupted = await aggregatesRepository.markInterruptedRuns(client);
    if (interrupted) logger.warn({ interrupted }, 'Marked unfinished retention runs as interrupted');

    const runId = await aggregatesRepository.startRun(client, {
      trigger,
      dryRun,
      userId,
      retentionDays: days,
      cutoff,
    });

    if (dryRun) {
      const preview = await aggregatesRepository.previewCompaction(client, cutoff);
      await aggregatesRepository.finishRun(client, runId, {
        status: 'succeeded',
        totals: { rowsCompacted: 0, bucketsWritten: 0 },
      });
      return {
        Status: 'succeeded',
        RunID: runId,
        Dry_Run: true,
        Cutoff: cutoff.toISOString(),
        Rows_Eligible: preview.rowsEligible,
        Periods_Affected: preview.periods,
        Rows_Compacted: 0,
        Buckets_Written: 0,
      };
    }

    let rowsCompacted = 0;
    let bucketsWritten = 0;
    try {
      const oldest = await aggregatesRepository.oldestEligibleBefore(client, cutoff);
      for (const window of compactionWindows(oldest, cutoff)) {
        await client.query('BEGIN');
        try {
          const moved = await aggregatesRepository.compactWindow(client, { ...window, runId });
          await aggregatesRepository.recordRunProgress(client, runId, moved);
          await client.query('COMMIT');
          rowsCompacted += moved.rowsCompacted;
          bucketsWritten += moved.bucketsWritten;
        } catch (error) {
          await client.query('ROLLBACK').catch(() => {});
          throw error;
        }
      }
      await aggregatesRepository.finishRun(client, runId, { status: 'succeeded' });
    } catch (error) {
      await aggregatesRepository
        .finishRun(client, runId, { status: 'failed', error: error.message })
        .catch((finishError) => logger.error({ err: finishError }, 'Could not record failed retention run'));
      throw error;
    } finally {
      if (rowsCompacted) {
        await invalidateNamespaces([cacheNamespaces.METRICS, cacheNamespaces.DASHBOARD]);
      }
    }

    if (rowsCompacted) {
      logger.info({ runId, rowsCompacted, bucketsWritten, cutoff }, 'Compacted old sensor readings');
    }
    return {
      Status: 'succeeded',
      RunID: runId,
      Dry_Run: false,
      Cutoff: cutoff.toISOString(),
      Rows_Compacted: rowsCompacted,
      Buckets_Written: bucketsWritten,
    };
  } finally {
    if (locked) await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
}

/**
 * What the admin storage panel shows: policy, row counts, on-disk size, and an
 * estimate of the space aggregation saved.
 */
export async function storageReport(now = new Date()) {
  const policy = retentionPolicy(now);
  const [stats, runs] = await Promise.all([
    aggregatesRepository.storageStats(policy.Cutoff),
    aggregatesRepository.listRuns(10),
  ]);

  const rawRows = Number(stats.raw_rows) || 0;
  const rawBytes = Number(stats.raw_bytes) || 0;
  const aggregateBytes = Number(stats.aggregate_bytes) || 0;
  const compacted = Number(stats.compacted_readings) || 0;
  // Per-row cost of the raw table now, applied to the readings that are gone.
  // An estimate: table bloat and index overhead make it approximate.
  const bytesPerRawRow = rawRows ? rawBytes / rawRows : null;
  const estimatedSaved = bytesPerRawRow == null ? null : Math.max(0, Math.round(compacted * bytesPerRawRow - aggregateBytes));

  return {
    Policy: policy,
    Raw: {
      Rows: rawRows,
      Manual_Rows: Number(stats.manual_rows) || 0,
      Corrected_Rows: Number(stats.corrected_rows) || 0,
      Eligible_Rows: Number(stats.eligible_rows) || 0,
      Oldest_Recorded_At: stats.oldest_raw ? new Date(stats.oldest_raw).toISOString() : null,
      Bytes: rawBytes,
    },
    Aggregates: {
      Rows: Number(stats.aggregate_rows) || 0,
      Readings_Represented: compacted,
      Oldest_Period_Start: stats.oldest_aggregate ? new Date(stats.oldest_aggregate).toISOString() : null,
      Newest_Period_Start: stats.newest_aggregate ? new Date(stats.newest_aggregate).toISOString() : null,
      Bytes: aggregateBytes,
    },
    Estimated_Bytes_Saved: estimatedSaved,
    Compression_Ratio: Number(stats.aggregate_rows) ? compacted / Number(stats.aggregate_rows) : null,
    Recent_Runs: runs,
  };
}
