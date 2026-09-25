import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

const { Pool, types } = pg;

// node-postgres hands back NUMERIC as a string to avoid float precision loss.
// Every numeric in this schema is a sensor reading or a weight well inside
// double precision, and the frontend expects JSON numbers rather than quoted
// strings, so they are parsed here instead of in each mapper.
types.setTypeParser(types.builtins.NUMERIC, (value) => (value === null ? null : Number(value)));
// int8 likewise, which is what count(*) returns.
types.setTypeParser(types.builtins.INT8, (value) => (value === null ? null : Number(value)));

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (error) => {
  // An idle client dropping is recoverable, so this must not be an unhandled
  // rejection that takes the process down.
  logger.error({ err: error }, 'Idle Postgres client errored');
});

export async function query(text, params) {
  const startedAt = performance.now();
  try {
    const result = await pool.query(text, params);
    const durationMs = performance.now() - startedAt;
    if (durationMs > 200) {
      logger.warn({ durationMs: Math.round(durationMs), rows: result.rowCount }, 'Slow query');
    }
    return result;
  } catch (error) {
    logger.error({ err: error, text: text.slice(0, 200) }, 'Query failed');
    throw error;
  }
}

/** First row, or null. */
export async function queryOne(text, params) {
  const { rows } = await query(text, params);
  return rows[0] ?? null;
}

export async function queryAll(text, params) {
  const { rows } = await query(text, params);
  return rows;
}

/**
 * Runs `handler` inside a transaction, rolling back on any throw. Needed
 * wherever a write spans tables, such as creating a shift and its assignments.
 */
export async function transaction(handler) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
