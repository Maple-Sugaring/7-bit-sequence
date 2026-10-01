import '../env.js';

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { SEEDED_LORA_IDS, SEEDED_STANDS } from '../../src/db/clearSeed.js';

describe('seed cleanup', () => {
  test('covers every fixture node and stand from the seed migration', async () => {
    const sql = await readFile(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations', '003_seed.sql'),
      'utf8',
    );
    const loraIds = [...sql.matchAll(/'(E8:9F:6D:[0-9A-F:]+)'/g)].map((match) => match[1]);
    assert.deepEqual(SEEDED_LORA_IDS, loraIds);
    for (const stand of SEEDED_STANDS) {
      assert.match(sql, new RegExp(stand));
    }
  });
});
