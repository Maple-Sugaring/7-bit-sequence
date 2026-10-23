import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import '../env.js';
import { ackOutcome, downlinkFor, isOpen } from '../../src/business/calibration.js';
import {
  calibrationBody,
  ingestReadingBody,
  nodeIntervalBody,
  updateSettingsBody,
} from '../../src/routes/schemas.js';

const migration = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'migrations',
  '016_calibration_commands.sql',
);

describe('calibration commands', () => {
  test('a tare goes out with no pounds and a calibrate carries the test weight', () => {
    assert.deepEqual(downlinkFor({ CommandID: 4, Action: 'tare', Pounds: null, Status: 'pending' }), {
      Command_Id: 4,
      Action: 'TARE',
    });
    assert.deepEqual(downlinkFor({ CommandID: 5, Action: 'calibrate', Pounds: 10, Status: 'sent' }), {
      Command_Id: 5,
      Action: 'CAL',
      Pounds: 10,
    });
  });

  test('only pending and sent commands are still going to the node', () => {
    assert.equal(isOpen({ Status: 'pending' }), true);
    assert.equal(isOpen({ Status: 'sent' }), true);
    assert.equal(isOpen({ Status: 'done' }), false);
    assert.equal(downlinkFor({ CommandID: 6, Action: 'tare', Status: 'done' }), null);
    assert.equal(downlinkFor(null), null);
  });

  test('the node acknowledges by echoing the command id', () => {
    const open = { CommandID: 7, Action: 'calibrate', Status: 'sent' };
    assert.deepEqual(ackOutcome(open, { Command_Id: 7, Command_Ok: true, Counts_Per_Lb: 10246 }), {
      status: 'done',
      countsPerLb: 10246,
    });
    assert.deepEqual(ackOutcome(open, { Command_Id: 7, Command_Ok: false }), {
      status: 'failed',
      countsPerLb: null,
    });
  });

  test('an ack for an older command, or no ack, changes nothing', () => {
    const open = { CommandID: 8, Action: 'tare', Status: 'sent' };
    assert.equal(ackOutcome(open, { Command_Id: 7, Command_Ok: true }), null);
    assert.equal(ackOutcome(open, {}), null);
    assert.equal(ackOutcome({ ...open, Status: 'done' }, { Command_Id: 8, Command_Ok: true }), null);
  });

  test('calibrate needs a test weight the cell can hold', () => {
    assert.equal(calibrationBody.safeParse({ Action: 'tare' }).success, true);
    assert.equal(calibrationBody.safeParse({ Action: 'calibrate', Pounds: 10 }).success, true);
    assert.equal(calibrationBody.safeParse({ Action: 'calibrate' }).success, false);
    assert.equal(calibrationBody.safeParse({ Action: 'calibrate', Pounds: 0.1 }).success, false);
    assert.equal(calibrationBody.safeParse({ Action: 'calibrate', Pounds: 500 }).success, false);
    assert.equal(calibrationBody.safeParse({ Action: 'reboot' }).success, false);
  });

  test('ingest accepts the ack fields from the node', () => {
    const parsed = ingestReadingBody.parse({
      Node_Code: 'NODE-001',
      Recorded_At: '2026-10-22T14:00:00.000Z',
      Weight: 10.02,
      Command_Id: 7,
      Command_Ok: 1,
      Counts_Per_Lb: 10246,
    });
    assert.equal(parsed.Command_Id, 7);
    assert.equal(parsed.Command_Ok, true);
    assert.equal(parsed.Counts_Per_Lb, 10246);
  });

  test('the migration stores commands and allows a 10 second interval', async () => {
    const sql = await readFile(migration, 'utf8');
    assert.match(sql, /create table if not exists calibration_commands/);
    assert.match(sql, /report_interval_seconds between 10 and 86400/);
  });
});

describe('packet interval in seconds', () => {
  test('a node interval can be 10 seconds', () => {
    assert.equal(nodeIntervalBody.parse({ Report_Interval_Seconds: 10 }).seconds, 10);
    assert.equal(nodeIntervalBody.safeParse({ Report_Interval_Seconds: 5 }).success, false);
    assert.equal(nodeIntervalBody.safeParse({ Report_Interval_Seconds: 86401 }).success, false);
  });

  test('minutes still work for older clients', () => {
    assert.equal(nodeIntervalBody.parse({ Report_Interval_Minutes: 15 }).seconds, 900);
    assert.equal(updateSettingsBody.parse({ Report_Interval_Minutes: 1 }).seconds, 60);
    assert.equal(updateSettingsBody.parse({ Report_Interval_Seconds: 10 }).seconds, 10);
    assert.equal(updateSettingsBody.safeParse({}).success, false);
  });
});
