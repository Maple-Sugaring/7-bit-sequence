/**
 * Background work the request path does not cover: ambient weather every few
 * minutes, downed-node checks, shift reminder emails, escalation of alerts
 * nobody resolved, and replay of readings buffered while Postgres was
 * unreachable.
 */

import { logger } from '../lib/logger.js';
import { ingestReadings } from './ingestService.js';
import { watchNodes } from './nodeWatch.js';
import { escalateStaleAlerts } from './notificationService.js';
import { ingestBuffer } from './readingBuffer.js';
import { sendShiftReminders } from './shiftNotifications.js';
import { getLive } from './weatherService.js';
import { runRetention } from './metricRetention.js';
import { pruneActivity, trackJob } from './activityService.js';

const WEATHER_MS = 10 * 60 * 1000;
// BRU-007. The cutoff moves an hour at a time, so a few runs a day keeps the
// raw table close to the window without the job ever being urgent.
const RETENTION_MS = 6 * 60 * 60 * 1000;
const NODES_MS = 5 * 60 * 1000;
const BUFFER_MS = 60 * 1000;
// FR-036. Activity is kept for days, so pruning once or twice a day is plenty.
const ACTIVITY_PRUNE_MS = 12 * 60 * 60 * 1000;
const REMINDERS_MS = 5 * 60 * 1000;
// Short enough that a 30 minute escalation lands within a minute of the mark.
const ESCALATION_MS = 60 * 1000;

// The job wrappers below record each run in activity_events (FR-036). They are
// exported so tests run exactly what the timers run.

/** Replays buffered batches with their original receipt time and request id. */
export function replayBuffer(buffer = ingestBuffer) {
  return trackJob(
    'ingest.buffer_replay',
    () => buffer.flush((batch) => ingestReadings({ ...batch, source: 'buffer_replay' })),
    (result) => (result.flushed || result.remaining
      ? { rowCount: result.flushed, outcome: result.remaining ? 'partial' : 'ok', detail: result }
      : null),
  );
}

export function retentionJob(options = {}) {
  return trackJob('retention.run', () => runRetention(options), (result) => ({
    rowCount: result.Rows_Compacted ?? 0,
    outcome: result.Status === 'succeeded' ? 'ok' : 'skipped',
    detail: { run_id: result.RunID ?? null, status: result.Status, cutoff: result.Cutoff ?? null, trigger: 'schedule' },
  }));
}

export function activityPruneJob(now = new Date()) {
  return trackJob('activity.prune', () => pruneActivity(now), (result) => ({
    rowCount: result.Deleted,
    outcome: result.Status === 'succeeded' ? 'ok' : 'skipped',
    detail: { cutoff: result.Cutoff ?? null },
  }));
}

/** Logged only when the job did something (or failed), not on every quiet tick. */
const whenNonZero = (count) => (count ? { rowCount: count } : null);

const watchNodesJob = () => trackJob('nodes.watch', () => watchNodes(), whenNonZero);
const escalationJob = () => trackJob('alerts.escalate', () => escalateStaleAlerts(), whenNonZero);
const remindersJob = () => trackJob('shifts.remind', () => sendShiftReminders(), whenNonZero);
// A weather poll succeeding every 10 minutes is not news; a failure is.
const weatherJob = () => trackJob('weather.poll', () => getLive(), () => null);

async function safe(label, task) {
  try {
    await task();
  } catch (error) {
    logger.error({ err: error }, label);
  }
}

export function startHousekeeping() {
  const weather = setInterval(() => safe('Live weather poll failed', () => weatherJob()), WEATHER_MS);
  const nodes = setInterval(() => safe('Downed-node check failed', () => watchNodesJob()), NODES_MS);
  const buffer = setInterval(
    () => safe('Ingest buffer replay failed', () => replayBuffer()),
    BUFFER_MS,
  );
  const reminders = setInterval(() => safe('Shift reminders failed', () => remindersJob()), REMINDERS_MS);

  const escalation = setInterval(
    () => safe('Alert escalation failed', () => escalationJob()),
    ESCALATION_MS,
  );

  const retention = setInterval(() => safe('Reading retention failed', () => retentionJob()), RETENTION_MS);

  const activity = setInterval(() => safe('Activity prune failed', () => activityPruneJob()), ACTIVITY_PRUNE_MS);

  for (const timer of [weather, nodes, buffer, reminders, escalation, retention, activity]) timer.unref();

  // Later than the other first runs so boot traffic is served first.
  const firstRetention = setTimeout(() => safe('Reading retention failed', () => retentionJob()), 5 * 60 * 1000);
  firstRetention.unref();

  const first = setTimeout(() => {
    safe('Live weather poll failed', () => weatherJob());
    safe('Downed-node check failed', () => watchNodesJob());
    safe('Ingest buffer replay failed', () => replayBuffer());
    safe('Shift reminders failed', () => remindersJob());
    safe('Alert escalation failed', () => escalationJob());
    safe('Activity prune failed', () => activityPruneJob());
  }, 15_000);
  first.unref();

  return () => {
    clearInterval(weather);
    clearInterval(nodes);
    clearInterval(buffer);
    clearInterval(reminders);
    clearInterval(escalation);
    clearInterval(retention);
    clearInterval(activity);
    clearTimeout(first);
    clearTimeout(firstRetention);
  };
}
