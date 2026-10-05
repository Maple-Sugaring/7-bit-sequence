/**
 * Local spool for sensor batches that could not reach Postgres.
 *
 * The gateway retries on its own when the API is down. This file is the other
 * direction: the API accepted the batch, then the database connection dropped,
 * so the samples stay on disk and are replayed once Postgres answers again.
 * Replay is safe because ingest treats the same node and timestamp as a retry.
 */

import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EAI_AGAIN',
  '57P01',
  '08000',
  '08001',
  '08003',
  '08006',
  '53300',
]);

export function isDatabaseUnavailable(error) {
  if (!error) return false;
  if (CONNECTION_CODES.has(error.code)) return true;
  const message = String(error.message ?? '');
  return /ECONNREFUSED|Connection terminated|connect ETIMEDOUT|the database system is/i.test(message);
}

export function createReadingBuffer(filePath) {
  return {
    async enqueue(batch) {
      await mkdir(dirname(filePath), { recursive: true });
      await appendFile(filePath, `${JSON.stringify(batch)}\n`, 'utf8');
    },

    async flush(send) {
      let raw;
      try {
        raw = await readFile(filePath, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') return { flushed: 0, remaining: 0 };
        throw error;
      }

      const lines = raw.split('\n').filter((line) => line.trim());
      const remaining = [];
      let flushed = 0;
      let stopped = false;

      for (const line of lines) {
        if (stopped) {
          remaining.push(line);
          continue;
        }
        try {
          await send(JSON.parse(line));
          flushed += 1;
        } catch (error) {
          remaining.push(line);
          // A down database will fail the rest of the file the same way.
          if (isDatabaseUnavailable(error)) stopped = true;
        }
      }

      if (remaining.length) {
        await writeFile(filePath, `${remaining.join('\n')}\n`, 'utf8');
      } else {
        await rm(filePath, { force: true });
      }

      return { flushed, remaining: remaining.length };
    },
  };
}

const defaultPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'ingest-buffer.jsonl');

export const ingestBuffer = createReadingBuffer(defaultPath);
