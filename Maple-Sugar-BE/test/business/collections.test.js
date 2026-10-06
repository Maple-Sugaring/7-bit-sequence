import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, mock, test } from 'node:test';

import '../env.js';
import { signAccessToken } from '../../src/auth/jwt.js';
import {
  collectionTitle,
  collectionVolumeGallons,
  netSapWeight,
  validateCollection,
} from '../../src/business/collections.js';
import { closePool, pool } from '../../src/db/pool.js';
import { createCollectionBody, createMetricBody, updateMetricBody } from '../../src/routes/schemas.js';

/**
 * Collection rules (issue #28) and the POST /collections route, end to end
 * against a fake Postgres. The point of the route is that a collection is one
 * unit, so these tests watch the transaction as much as the rows.
 */

describe('optional numbers in request bodies', () => {
  // z.coerce.number() runs Number(null), which is 0. With null tried second, a
  // blank sugar reading became "0% sugar" and was refused, so weight-only
  // collections never saved. null has to survive as null.
  test('an explicit null stays null instead of becoming zero', () => {
    const metric = createMetricBody.parse({ NodeID: 1, Weight: 20, Sugar_Percent: null, Temperature: null });
    assert.equal(metric.Sugar_Percent, null);
    assert.equal(metric.Temperature, null);

    const collection = createCollectionBody.parse({ NodeID: 1, Weight: 20, Sugar_Percent: null });
    assert.equal(collection.Sugar_Percent, null);

    assert.equal(updateMetricBody.parse({ Sugar_Percent: null }).Sugar_Percent, null);
  });

  test('numbers and numeric strings still parse, and an absent field stays absent', () => {
    const parsed = createMetricBody.parse({ NodeID: 1, Weight: '20.5', Sugar_Percent: 2.3 });
    assert.equal(parsed.Weight, 20.5);
    assert.equal(parsed.Sugar_Percent, 2.3);
    assert.equal(createMetricBody.parse({ NodeID: 1 }).Sugar_Percent, undefined);
  });

  test('junk is still refused', () => {
    assert.throws(() => createMetricBody.parse({ NodeID: 1, Sugar_Percent: 'abc' }));
  });
});

describe('collection rules', () => {
  test('volume is counted from net weight, with the bucket taken off', () => {
    assert.equal(netSapWeight(12, 2), 10);
    assert.equal(netSapWeight(1, 2), 0);
    assert.equal(collectionVolumeGallons(2 + 8.34 * 5, 2), 5);
    assert.equal(collectionVolumeGallons(30, 2.5), 3.3);
    assert.equal(collectionVolumeGallons(50, null), 6);
  });

  test('sugar is optional and a weight is not', () => {
    assert.equal(validateCollection({ NodeID: 1, Weight: 20 }).isValid, true);
    assert.equal(validateCollection({ NodeID: 1, Weight: 20, Sugar_Percent: null }).isValid, true);

    const sugarOnly = validateCollection({ NodeID: 1, Sugar_Percent: 2.1 });
    assert.equal(sugarOnly.isValid, false);
    assert.equal(sugarOnly.errors.Weight, 'Enter the sap weight.');

    const neither = validateCollection({ NodeID: 1 });
    assert.deepEqual(Object.keys(neither.errors), ['Weight']);
  });

  test('a tested sugar value must be believable', () => {
    assert.match(validateCollection({ NodeID: 1, Weight: 20, Sugar_Percent: 40 }).errors.Sugar_Percent, /between/);
    assert.equal(validateCollection({ NodeID: 1, Weight: 20, Sugar_Percent: 9, Ice_Present: true }).isValid, true);
  });

  test('a weight that is not above the empty bucket collected nothing', () => {
    const result = validateCollection({ NodeID: 1, Weight: 2 }, { tareWeight: 2.5 });
    assert.equal(result.isValid, false);
    assert.match(result.errors.Weight, /empty bucket/);
  });

  test('titles name the tree', () => {
    assert.equal(collectionTitle('Alumni 1'), 'Collected Alumni 1');
    assert.equal(collectionTitle(null), 'Collection');
  });
});

// -------------------------------------------------------------- fake database

const STUDENT_ID = 2;
const REF = '4c9a3c1e-8d3a-4a58-9a1e-2b6f0d7a9c11';

let db;
let transactionLog;

function reset() {
  db = {
    nodes: [
      { id: 1, node_code: 'NODE-001', node_name: 'Alumni House - Tree 1', status_code: 1, tracked: true },
    ],
    bucketId: 11,
    tare: 2.5,
    metrics: [],
    logs: [],
    journal: [],
    resolved: [],
    failJournal: false,
    failAlerts: false,
  };
  transactionLog = [];
}

const user = (id, roleId) => ({
  id,
  role_id: roleId,
  first_name: 'Sam',
  last_name: 'Student',
  email: 'sam@g.rit.edu',
  created_at: '2026-01-15',
  is_active: true,
  account_expiry: '2099-06-01T00:00:00.000Z',
  invite_pending: false,
  email_alerts: null,
  email_shifts: true,
});

function rows(list) {
  return { rows: list, rowCount: list.length };
}

function journalRow(entry) {
  return {
    id: entry.id,
    user_id: entry.user_id,
    node_id: entry.node_id,
    bucket_id: entry.bucket_id,
    collected_at: entry.collected_at,
    title: entry.title,
    process_notes: entry.process_notes,
    weight_lb: entry.weight_lb,
    sugar_percent: entry.sugar_percent,
    ice_present: entry.ice_present,
    round_label: entry.round_label,
    author_name: 'Sam Student',
    node_name: 'Alumni House - Tree 1',
  };
}

function handle(text, params = []) {
  const sql = String(text);

  if (sql.trim() === 'BEGIN' || sql.trim() === 'COMMIT' || sql.trim() === 'ROLLBACK') {
    transactionLog.push(sql.trim());
    return rows([]);
  }

  if (sql.includes('from users where id = $1')) {
    const id = Number(params[0]);
    return rows(id === STUDENT_ID ? [user(STUDENT_ID, 2)] : id === 8 ? [user(8, 3)] : []);
  }
  if (sql.includes('from node where id = $1')) {
    return rows(db.nodes.filter((node) => node.id === Number(params[0])));
  }
  if (sql.includes('select tare_weight from buckets')) {
    return db.tare == null ? rows([]) : rows([{ tare_weight: db.tare }]);
  }
  if (sql.includes('select id from buckets')) {
    return db.bucketId == null ? rows([]) : rows([{ id: db.bucketId }]);
  }

  if (sql.includes('where j.client_ref = $1')) {
    return rows(db.journal.filter((entry) => entry.client_ref === params[0]).map(journalRow));
  }
  if (sql.includes('where j.id = $1')) {
    return rows(db.journal.filter((entry) => entry.id === params[0]).map(journalRow));
  }

  if (sql.includes('insert into metrics')) {
    const row = {
      id: 100 + db.metrics.length,
      node_id: params[0],
      bucket_id: params[1],
      recorded_by_user_id: params[2],
      recorded_at: params[3],
      weight: params[4],
      sugar_percent: params[6],
      ice_present: params[8],
    };
    db.metrics.push(row);
    return rows([row]);
  }
  if (sql.includes('insert into collection_logs')) {
    const row = {
      id: 200 + db.logs.length,
      bucket_id: params[0],
      node_id: params[1],
      user_id: params[2],
      collected_at: params[3],
      volume_collected: params[4],
      quality_notes: params[5],
    };
    db.logs.push(row);
    return rows([row]);
  }
  if (sql.includes('insert into collection_journal')) {
    if (db.failJournal) throw new Error('disk full');
    const entry = {
      id: 300 + db.journal.length,
      user_id: params[0],
      node_id: params[1],
      bucket_id: params[2],
      collected_at: params[3],
      title: params[4],
      process_notes: params[5],
      weight_lb: params[6],
      sugar_percent: params[7],
      ice_present: params[8],
      round_label: params[9],
      client_ref: params[10],
    };
    db.journal.push(entry);
    return rows([{ id: entry.id }]);
  }

  if (sql.includes('update alerts')) {
    if (db.failAlerts) throw new Error('alert update failed');
    db.resolved.push({ nodeId: params[0], types: params[1] });
    return { rows: [], rowCount: 1 };
  }

  return rows([]);
}

// A transaction in this fake keeps its writes, then undoes them on ROLLBACK, so
// a test can see that a failure leaves nothing behind.
mock.method(pool, 'query', async (text, params) => handle(text, params));
mock.method(pool, 'connect', async () => {
  const snapshot = {
    metrics: [...db.metrics],
    logs: [...db.logs],
    journal: [...db.journal],
    resolved: [...db.resolved],
  };
  return {
    query: async (text, params) => {
      const sql = String(text).trim();
      if (sql === 'ROLLBACK') {
        db.metrics = snapshot.metrics;
        db.logs = snapshot.logs;
        db.journal = snapshot.journal;
        db.resolved = snapshot.resolved;
      }
      return handle(text, params);
    },
    release() {},
  };
});

let baseUrl;
let server;

before(async () => {
  reset();
  const { createApp } = await import('../../src/app.js');
  server = createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await closePool();
});

async function post(body, { userId = STUDENT_ID, roleId = 2, signedIn = true } = {}) {
  const headers = { accept: 'application/json', 'content-type': 'application/json' };
  if (signedIn) {
    headers.authorization = `Bearer ${signAccessToken({ UserID: userId, Email: 'sam@g.rit.edu', RoleID: roleId })}`;
  }
  const response = await fetch(`${baseUrl}/collections`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
}

const untested = { NodeID: 1, Weight: 2.5 + 8.34 * 4, Ice_Present: false, Collected_At: '2026-03-02T14:00:00.000Z' };

describe('POST /collections', () => {
  test('one save writes the reading, the collection log, and the journal entry together', async () => {
    reset();
    const response = await post({ ...untested, Notes: 'Lid was frozen.', Round_Label: 'Morning round', Client_Ref: REF });

    assert.equal(response.status, 201);
    assert.equal(response.json.Duplicate, false);
    assert.deepEqual(transactionLog, ['BEGIN', 'COMMIT']);

    assert.equal(db.metrics.length, 1);
    assert.equal(db.metrics[0].weight, untested.Weight);
    assert.equal(db.metrics[0].recorded_by_user_id, STUDENT_ID);
    assert.equal(db.metrics[0].bucket_id, 11);

    assert.equal(db.logs.length, 1);
    assert.equal(db.logs[0].volume_collected, 4, 'gallons come from net weight, not gross');
    assert.equal(db.logs[0].user_id, STUDENT_ID);
    assert.equal(db.logs[0].quality_notes, 'Lid was frozen.');

    assert.equal(db.journal.length, 1);
    assert.equal(db.journal[0].title, 'Collected Alumni House - Tree 1');
    assert.equal(db.journal[0].round_label, 'Morning round');
    assert.equal(db.journal[0].client_ref, REF);
    assert.equal(response.json.Entry.Round_Label, 'Morning round');
    assert.equal(response.json.Log.Volume_Collected, 4);
  });

  test('an untested collection stores no sugar anywhere', async () => {
    reset();
    const response = await post({ ...untested, Sugar_Percent: null });

    assert.equal(response.status, 201);
    assert.equal(db.metrics[0].sugar_percent, null);
    assert.equal(db.journal[0].sugar_percent, null);
    assert.equal(response.json.Entry.Sugar_Percent, null);
  });

  test('a tested sugar value is stored with the reading and the entry', async () => {
    reset();
    const response = await post({ ...untested, Sugar_Percent: 2.3 });

    assert.equal(response.status, 201);
    assert.equal(db.metrics[0].sugar_percent, 2.3);
    assert.equal(db.journal[0].sugar_percent, 2.3);
  });

  test('closes the open full-bucket alerts for that tree', async () => {
    reset();
    await post(untested);

    assert.deepEqual(db.resolved, [{ nodeId: 1, types: ['Full Bucket', 'Collection Needed'] }]);
  });

  test('answers a retried upload with the entry already stored', async () => {
    reset();
    const first = await post({ ...untested, Client_Ref: REF });
    assert.equal(first.status, 201);

    const retry = await post({ ...untested, Client_Ref: REF });
    assert.equal(retry.status, 200);
    assert.equal(retry.json.Duplicate, true);
    assert.equal(retry.json.Entry.EntryID, first.json.Entry.EntryID);
    assert.equal(db.metrics.length, 1);
    assert.equal(db.logs.length, 1);
    assert.equal(db.journal.length, 1);
    assert.equal(db.resolved.length, 1, 'a retry does not close alerts a second time');
  });

  test('leaves nothing behind when the last write fails', async () => {
    reset();
    db.failJournal = true;
    const response = await post(untested);

    assert.equal(response.status, 500);
    assert.deepEqual(transactionLog, ['BEGIN', 'ROLLBACK']);
    assert.equal(db.metrics.length, 0);
    assert.equal(db.logs.length, 0);
    assert.equal(db.journal.length, 0);
    assert.equal(db.resolved.length, 0);
  });

  test('rolls back the collection when its alert cannot be cleared', async () => {
    reset();
    db.failAlerts = true;
    const response = await post({ ...untested, Client_Ref: REF });

    assert.equal(response.status, 500);
    assert.deepEqual(transactionLog, ['BEGIN', 'ROLLBACK']);
    assert.equal(db.metrics.length, 0);
    assert.equal(db.logs.length, 0);
    assert.equal(db.journal.length, 0);

    db.failAlerts = false;
    const retry = await post({ ...untested, Client_Ref: REF });
    assert.equal(retry.status, 201);
    assert.equal(db.resolved.length, 1);
  });

  test('rejects a missing weight with a field-keyed error and writes nothing', async () => {
    reset();
    const response = await post({ NodeID: 1, Sugar_Percent: 2.1 });

    assert.equal(response.status, 422);
    assert.equal(response.json.details.Weight, 'Enter the sap weight.');
    assert.deepEqual(transactionLog, []);
    assert.equal(db.metrics.length, 0);
  });

  test('rejects a tree that does not exist', async () => {
    reset();
    const response = await post({ ...untested, NodeID: 99 });

    assert.equal(response.status, 404);
    assert.equal(db.metrics.length, 0);
  });

  test('records a tree with no bucket assigned, using no tare', async () => {
    reset();
    db.bucketId = null;
    db.tare = null;
    const response = await post({ ...untested, Weight: 8.34 * 3 });

    assert.equal(response.status, 201);
    assert.equal(db.logs[0].bucket_id, null);
    assert.equal(db.logs[0].volume_collected, 3);
  });

  test('needs a signed-in role that can record data', async () => {
    reset();
    const anonymous = await post(untested, { signedIn: false });
    assert.equal(anonymous.status, 401);

    const mss = await post(untested, { userId: 8, roleId: 3 });
    assert.equal(mss.status, 403);
    assert.equal(db.metrics.length, 0);
  });
});
