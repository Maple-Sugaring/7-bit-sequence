/**
 * Background work the request path does not cover: ambient weather every few
 * minutes, downed-node checks, and replay of readings buffered while Postgres
 * was unreachable.
 */

import { logger } from '../lib/logger.js';
import { ingestReadings } from './ingestService.js';
import { watchNodes } from './nodeWatch.js';
import { ingestBuffer } from './readingBuffer.js';
import { getLive } from './weatherService.js';

const WEATHER_MS = 10 * 60 * 1000;
const NODES_MS = 5 * 60 * 1000;
const BUFFER_MS = 60 * 1000;

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

  for (const timer of [weather, nodes, buffer]) timer.unref();

  const first = setTimeout(() => {
    safe('Live weather poll failed', () => getLive());
    safe('Downed-node check failed', () => watchNodes());
    safe('Ingest buffer replay failed', () => ingestBuffer.flush((batch) => ingestReadings(batch)));
  }, 15_000);
  first.unref();

  return () => {
    clearInterval(weather);
    clearInterval(nodes);
    clearInterval(buffer);
    clearTimeout(first);
  };
}
