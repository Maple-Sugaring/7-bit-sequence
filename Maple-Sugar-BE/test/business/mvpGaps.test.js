import '../env.js';

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { staleNodeAlerts } from '../../src/services/nodeWatch.js';
import { shouldNotify } from '../../src/services/notificationService.js';
import { createReadingBuffer, isDatabaseUnavailable } from '../../src/services/readingBuffer.js';

describe('critical notification gate', () => {
  test('sends for critical alerts and for a full bucket', () => {
    assert.equal(shouldNotify({ Alert_Type: 'Spoilage', severity: 'critical' }), true);
    assert.equal(shouldNotify({ Alert_Type: 'Full Bucket', severity: 'warning' }), true);
    assert.equal(shouldNotify({ Alert_Type: 'Node Offline', severity: 'critical' }), true);
    assert.equal(shouldNotify({ Alert_Type: 'Low Battery', severity: 'warning' }), false);
    assert.equal(shouldNotify(null), false);
  });
});

describe('downed nodes', () => {
  test('flags a tracked node that has been quiet for 45 minutes', () => {
    const now = new Date('2026-03-20T16:00:00.000Z');
    const alerts = staleNodeAlerts(
      [
        {
          NodeID: 1,
          Node_Name: 'Alumni 1',
          Tracked: true,
          Status_Code: 1,
          Last_Seen: '2026-03-20T14:00:00.000Z',
        },
        {
          NodeID: 2,
          Node_Name: 'Alumni 2',
          Tracked: true,
          Status_Code: 1,
          Last_Seen: '2026-03-20T15:40:00.000Z',
        },
        {
          NodeID: 3,
          Node_Name: 'Shop',
          Tracked: true,
          Status_Code: 3,
          Last_Seen: '2026-03-01T00:00:00.000Z',
        },
      ],
      now,
    );

    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].NodeID, 1);
    assert.equal(alerts[0].Alert_Type, 'Node Offline');
    assert.equal(alerts[0].severity, 'critical');
  });
});

describe('local ingest buffer', () => {
  test('recognizes a refused database connection', () => {
    assert.equal(isDatabaseUnavailable({ code: 'ECONNREFUSED' }), true);
    assert.equal(isDatabaseUnavailable({ code: '23505', message: 'duplicate key' }), false);
  });

  let directory;
  let buffer;

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), 'maple-buffer-'));
    buffer = createReadingBuffer(join(directory, 'ingest-buffer.jsonl'));
  });

  after(() => rm(directory, { recursive: true, force: true }));

  test('keeps a batch when the database is still down and drops it after a successful replay', async () => {
    await buffer.enqueue({ gatewayCode: 'GW', readings: [{ Weight: 10 }] });

    const blocked = await buffer.flush(async () => {
      const error = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      throw error;
    });
    assert.deepEqual(blocked, { flushed: 0, remaining: 1 });

    const sent = [];
    const replayed = await buffer.flush(async (batch) => {
      sent.push(batch);
    });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].gatewayCode, 'GW');
    assert.deepEqual(replayed, { flushed: 1, remaining: 0 });
  });
});
