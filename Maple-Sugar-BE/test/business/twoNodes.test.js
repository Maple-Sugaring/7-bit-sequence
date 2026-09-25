import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { DEFAULT_COMPARE_YEAR } from '../../src/business/season.js';

const migration = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'migrations',
  '009_two_nodes.sql',
);

describe('two tracked nodes', () => {
  test('only NODE-001 and NODE-002 stay on the board', async () => {
    const sql = await readFile(migration, 'utf8');
    assert.match(sql, /tracked = node_code in \('NODE-001', 'NODE-002'\)/);
    assert.doesNotMatch(sql, /NODE-007|NODE-012/);
  });

  test('weather compare defaults to 2026 instead of the old sap year', () => {
    assert.equal(DEFAULT_COMPARE_YEAR, 2026);
  });
});
