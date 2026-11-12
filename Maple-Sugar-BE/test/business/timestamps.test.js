/**
 * FR-036 rules that need no database: what counts as an unambiguous instant,
 * UTC normalisation across offsets and DST, delay arithmetic, what activity
 * detail may hold, read summaries, retention cutoffs, and request ids.
 */

import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';

import '../env.js';
import {
  acceptRequestId,
  activityCutoff,
  activityDetail,
  hasExplicitOffset,
  ingestDelaySeconds,
  summarizeRead,
  toUtcIso,
} from '../../src/business/activity.js';
import { validateReading } from '../../src/business/validation.js';
import { createMetricBody, ingestReadingBody, updateMetricBody } from '../../src/routes/schemas.js';
import { requestContext } from '../../src/middleware/requestContext.js';
import { closePool } from '../../src/db/pool.js';

after(() => closePool());

describe('client timestamps must name their offset', () => {
  test('accepts Z and numeric offsets, with or without fractions', () => {
    for (const value of [
      '2026-03-08T07:00:00Z',
      '2026-03-08T07:00:00.123Z',
      '2026-03-08T02:00:00-05:00',
      '2026-03-08T12:30:00+0530',
      '2026-03-08T07:00Z',
    ]) {
      assert.equal(hasExplicitOffset(value), true, value);
    }
  });

  test('refuses local-time and date-only strings that two systems could read differently', () => {
    for (const value of ['2026-03-08T07:00:00', '2026-03-08', '2026-03-08 07:00:00', 'yesterday', '', null, 1741417200000]) {
      assert.equal(hasExplicitOffset(value), false, String(value));
    }
  });

  test('refuses an offset-shaped string that is not a real date', () => {
    assert.equal(hasExplicitOffset('2026-02-30T25:00:00Z'), false);
  });

  test('ingest, manual entry and correction all enforce it on Recorded_At', () => {
    const ingest = ingestReadingBody.safeParse({ Node_Code: 'NODE-001', Recorded_At: '2026-03-08T07:00:00', Weight: 10 });
    assert.equal(ingest.success, false);
    assert.match(ingest.error.issues[0].message, /UTC offset/);

    assert.equal(createMetricBody.safeParse({ NodeID: 1, Recorded_At: '2026-03-08T07:00' }).success, false);
    assert.equal(createMetricBody.safeParse({ NodeID: 1, Recorded_At: '2026-03-08T07:00:00Z' }).success, true);
    assert.equal(createMetricBody.safeParse({ NodeID: 1 }).success, true, 'blank still means "now"');

    const correction = { Expected_Revision: 0, Correction_Reason: 'clock', Recorded_At: '2026-03-08T07:00:00' };
    assert.equal(updateMetricBody.safeParse(correction).success, false);
    assert.equal(updateMetricBody.safeParse({ ...correction, Recorded_At: '2026-03-08T02:00:00-05:00' }).success, true);
  });
});

describe('UTC normalisation', () => {
  test('the same instant in different zones becomes the same UTC string', () => {
    const utc = toUtcIso('2026-03-08T07:30:00Z');
    assert.equal(toUtcIso('2026-03-08T02:30:00-05:00'), utc);
    assert.equal(toUtcIso('2026-03-08T13:00:00+05:30'), utc);
    assert.equal(toUtcIso(new Date(utc)), utc);
  });

  test('both sides of the spring-forward gap stay an hour apart in UTC', () => {
    // America/New_York jumps 02:00 EST → 03:00 EDT on 2026-03-08.
    const before = toUtcIso('2026-03-08T01:59:59-05:00');
    const after = toUtcIso('2026-03-08T03:00:00-04:00');
    assert.equal(before, '2026-03-08T06:59:59.000Z');
    assert.equal(after, '2026-03-08T07:00:00.000Z');
  });

  test('the repeated fall-back hour is two different instants', () => {
    // 01:30 happens twice on 2026-11-01 in New York.
    assert.notEqual(toUtcIso('2026-11-01T01:30:00-04:00'), toUtcIso('2026-11-01T01:30:00-05:00'));
  });

  test('junk is null rather than a guessed time', () => {
    assert.equal(toUtcIso('not a date'), null);
    assert.equal(toUtcIso(''), null);
    assert.equal(toUtcIso(null), null);
  });
});

describe('ingest delay', () => {
  test('a reading uploaded a day late reports the delay in seconds', () => {
    assert.equal(ingestDelaySeconds('2026-03-01T10:00:00Z', '2026-03-02T10:00:00Z'), 86_400);
  });

  test('a node clock running ahead shows as a negative delay', () => {
    assert.equal(ingestDelaySeconds('2026-03-01T10:00:30Z', '2026-03-01T10:00:00Z'), -30);
  });

  test('offsets do not change the delay', () => {
    assert.equal(ingestDelaySeconds('2026-03-01T05:00:00-05:00', '2026-03-01T10:00:05Z'), 5);
  });

  test('is null when either time is missing', () => {
    assert.equal(ingestDelaySeconds(null, '2026-03-01T10:00:00Z'), null);
    assert.equal(ingestDelaySeconds('2026-03-01T10:00:00Z', undefined), null);
  });
});

describe('future readings are judged against receipt, not processing', () => {
  const reading = { NodeID: 1, Weight: 20, Recorded_At: '2026-03-01T10:00:30Z' };

  test('a reading 30 s ahead of receipt is within the clock slack', () => {
    assert.equal(validateReading(reading, { now: new Date('2026-03-01T10:00:00Z') }).isValid, true);
  });

  test('a reading 5 minutes ahead of receipt is rejected even when replayed later', () => {
    const result = validateReading({ ...reading, Recorded_At: '2026-03-01T10:05:00Z' }, { now: new Date('2026-03-01T10:00:00Z') });
    assert.equal(result.isValid, false);
    assert.match(result.errors.Recorded_At, /future/);
  });

  test('without a receipt time the current clock is used, as before', () => {
    const ahead = new Date(Date.now() + 10 * 60_000).toISOString();
    assert.equal(validateReading({ ...reading, Recorded_At: ahead }).isValid, false);
  });
});

describe('activity detail', () => {
  test('keeps ids, counts, filters and times', () => {
    const detail = activityDetail({
      filters: { nodeId: 4, from: '2026-03-01T00:00:00Z' },
      metric_ids: [1, 2, 3],
      accepted: 3,
      at: new Date('2026-03-01T10:00:00Z'),
      ok: true,
    });
    assert.deepEqual(detail, {
      filters: { nodeId: 4, from: '2026-03-01T00:00:00Z' },
      metric_ids: [1, 2, 3],
      accepted: 3,
      at: '2026-03-01T10:00:00.000Z',
      ok: true,
    });
  });

  test('drops credentials, contact details, notes and bodies by key', () => {
    const detail = activityDetail({
      token: 'abc',
      Authorization: 'Bearer x',
      password: 'p',
      email: 'someone@example.edu',
      Correction_Reason: 'typo',
      note: 'free text',
      body: { Weight: 1 },
      filters: { session: 'abc', nodeId: 1 },
      kept: 1,
    });
    assert.deepEqual(detail, { filters: { nodeId: 1 }, kept: 1 });
  });

  test('caps long strings, long arrays and deep nesting', () => {
    const detail = activityDetail({
      text: 'x'.repeat(500),
      ids: Array.from({ length: 80 }, (_, index) => index),
      deep: { a: { b: { c: 1 } } },
    });
    assert.equal(detail.text.length, 201);
    assert.equal(detail.ids.length, 50);
    assert.deepEqual(detail.deep, { a: {} });
  });

  test('ignores a non-object', () => {
    assert.deepEqual(activityDetail(null), {});
    assert.deepEqual(activityDetail('payload'), {});
  });
});

describe('read summaries', () => {
  test('records the nodes and the measurement range a list returned', () => {
    const summary = summarizeRead([
      { NodeID: 3, Recorded_At: '2026-03-02T00:00:00.000Z' },
      { NodeID: 1, Recorded_At: '2026-03-01T00:00:00.000Z' },
      { NodeID: 3, Recorded_At: '2026-03-03T00:00:00.000Z' },
    ]);
    assert.deepEqual(summary, {
      node_ids: [1, 3],
      node_ids_truncated: false,
      recorded_from: '2026-03-01T00:00:00.000Z',
      recorded_to: '2026-03-03T00:00:00.000Z',
    });
  });

  test('an empty read has no range', () => {
    assert.deepEqual(summarizeRead([]), { node_ids: [], node_ids_truncated: false, recorded_from: null, recorded_to: null });
  });
});

describe('activity retention', () => {
  test('cuts off exactly the configured number of days back', () => {
    assert.equal(activityCutoff('2026-11-12T00:00:00Z', 90).toISOString(), '2026-08-14T00:00:00.000Z');
  });

  test('0 or a negative value keeps everything', () => {
    assert.equal(activityCutoff(new Date(), 0), null);
    assert.equal(activityCutoff(new Date(), -1), null);
  });
});

describe('request correlation', () => {
  function run(headers = {}) {
    const req = { headers, get: (name) => headers[name.toLowerCase()] };
    const sent = {};
    const res = { setHeader: (name, value) => { sent[name] = value; } };
    let called = false;
    requestContext(req, res, () => { called = true; });
    return { req, sent, called };
  }

  test('stamps receipt time and a fresh id, and echoes it back', () => {
    const before = Date.now();
    const { req, sent, called } = run();
    assert.equal(called, true);
    assert.ok(req.receivedAt instanceof Date);
    assert.ok(req.receivedAt.getTime() >= before && req.receivedAt.getTime() <= Date.now());
    assert.match(req.id, /^[0-9a-f-]{36}$/);
    assert.equal(sent['X-Request-Id'], req.id);
  });

  test('keeps a well-formed caller id so one trace spans gateway and API', () => {
    const { req } = run({ 'x-request-id': 'gw-node7-000123' });
    assert.equal(req.id, 'gw-node7-000123');
  });

  test('replaces an id that could inject into logs or queries', () => {
    for (const bad of ['short', 'has space in it', "x'; drop table--", 'a'.repeat(65)]) {
      assert.equal(acceptRequestId(bad), null, bad);
      assert.notEqual(run({ 'x-request-id': bad }).req.id, bad);
    }
  });
});
