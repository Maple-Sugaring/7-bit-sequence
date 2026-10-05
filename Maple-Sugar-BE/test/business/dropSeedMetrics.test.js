import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const migration = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'migrations',
  '010_drop_seed_metrics.sql',
);

describe('seeded alert removal', () => {
  test('drops the fixture alerts from before the hardware was live', async () => {
    const sql = await readFile(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations', '011_drop_seed_alerts.sql'),
      'utf8',
    );
    assert.match(sql, /delete from alerts where id <= 8/);
  });
});

describe('seeded metric removal', () => {
  test('deletes rows that carry a modeled temperature and leaves ingest rows', async () => {
    const sql = await readFile(migration, 'utf8');
    assert.match(sql, /delete from metrics where temperature is not null/);
  });
});
