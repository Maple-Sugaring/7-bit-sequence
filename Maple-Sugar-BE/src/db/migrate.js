/**
 * Forward-only migration runner.
 *
 * Applies every .sql file in ../../migrations in filename order, once each,
 * recording what ran in schema_migrations. Each file runs inside its own
 * transaction, so a failure leaves the database on the last good version
 * rather than half-migrated.
 *
 * Run directly (`npm run migrate`) or imported and awaited on API boot.
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pool, closePool } from './pool.js';
import { logger } from '../lib/logger.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      version     text primary key,
      applied_at  timestamp with time zone not null default CURRENT_TIMESTAMP
    )
  `);
}

export async function runMigrations() {
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);

    const { rows } = await client.query('select version from schema_migrations');
    const applied = new Set(rows.map((row) => row.version));

    const files = (await readdir(migrationsDir))
      .filter((name) => name.endsWith('.sql'))
      .sort();

    const pending = files.filter((name) => !applied.has(name));

    if (!pending.length) {
      logger.info({ applied: applied.size }, 'Database schema is up to date');
      return { applied: [] };
    }

    for (const file of pending) {
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      logger.info({ migration: file }, 'Applying migration');

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('insert into schema_migrations (version) values ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Migration ${file} failed: ${error.message}`, { cause: error });
      }
    }

    logger.info({ migrations: pending }, 'Migrations applied');
    return { applied: pending };
  } finally {
    client.release();
  }
}

// Only tear the pool down when invoked as a script; when imported on boot the
// API needs the pool to stay open. Compared as file URLs rather than raw paths
// because import.meta.url percent-encodes characters that argv does not, and
// this project's path contains spaces.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    await runMigrations();
    await closePool();
  } catch (error) {
    logger.error({ err: error }, 'Migration run failed');
    await closePool();
    process.exit(1);
  }
}
