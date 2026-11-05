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

const WEATHER_MS = 10 * 60 * 1000;
// BRU-007. The cutoff moves an hour at a time, so a few runs a day keeps the
// raw table close to the window without the job ever being urgent.
const RETENTION_MS = 6 * 60 * 60 * 1000;
const NODES_MS = 5 * 60 * 1000;
const BUFFER_MS = 60 * 1000;
const REMINDERS_MS = 5 * 60 * 1000;
// Short enough that a 30 minute escalation lands within a minute of the mark.
const ESCALATION_MS = 60 * 1000;

async function safe(label, task) {
  try {
    await task();
  } catch (error) {
    logger.error({ err: error }, label);
  }
}

export function startHousekeeping() {
  const weather = setInterval(() => safe('Live weather poll failed', () => getLive()), WEATHER_MS);
  const nodes = setInterval(() => safe('Downed-node check failed', () => watchNodes()), NODES_MS);
  const buffer = setInterval(
    () => safe('Ingest buffer replay failed', () => ingestBuffer.flush((batch) => ingestReadings(batch))),
    BUFFER_MS,
  );
  const reminders = setInterval(() => safe('Shift reminders failed', () => sendShiftReminders()), REMINDERS_MS);

  const escalation = setInterval(
    () => safe('Alert escalation failed', () => escalateStaleAlerts()),
    ESCALATION_MS,
  );

  const retention = setInterval(() => safe('Reading retention failed', () => runRetention()), RETENTION_MS);

  for (const timer of [weather, nodes, buffer, reminders, escalation, retention]) timer.unref();

  // Later than the other first runs so boot traffic is served first.
  const firstRetention = setTimeout(() => safe('Reading retention failed', () => runRetention()), 5 * 60 * 1000);
  firstRetention.unref();

  const first = setTimeout(() => {
    safe('Live weather poll failed', () => getLive());
    safe('Downed-node check failed', () => watchNodes());
    safe('Ingest buffer replay failed', () => ingestBuffer.flush((batch) => ingestReadings(batch)));
    safe('Shift reminders failed', () => sendShiftReminders());
    safe('Alert escalation failed', () => escalateStaleAlerts());
  }, 15_000);
  first.unref();

  return () => {
    clearInterval(weather);
    clearInterval(nodes);
    clearInterval(buffer);
    clearInterval(reminders);
    clearInterval(escalation);
    clearInterval(retention);
    clearTimeout(first);
    clearTimeout(firstRetention);
  };
}
