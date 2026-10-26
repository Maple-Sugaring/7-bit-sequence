import { describe, expect, test } from 'vitest';

import {
  MAX_TEST_POUNDS,
  MIN_TEST_POUNDS,
  calibrationCheck,
  commandState,
  elapsedLabel,
  liveStatus,
  packetIntervalLabel,
  readingAfterAck,
  testWeightError,
  waitingStatus,
} from '../src/business/calibration';
import {
  MAX_TEST_POUNDS as serverMax,
  MIN_TEST_POUNDS as serverMin,
} from '../../Maple-Sugar-BE/src/business/calibration.js';
import { request } from '../src/data/transports/mockTransport';

const send = (method, path, body) => request({ method, path, body });

describe('calibration rules', () => {
  test('the test-weight limits match the API', () => {
    expect(MIN_TEST_POUNDS).toBe(serverMin);
    expect(MAX_TEST_POUNDS).toBe(serverMax);
  });

  test('a test weight must be a number the cell can hold', () => {
    expect(testWeightError('')).toMatch(/Enter/);
    expect(testWeightError('abc')).toMatch(/Enter/);
    expect(testWeightError('0.1')).toMatch(/at least/);
    expect(testWeightError('900')).toMatch(/or less/);
    expect(testWeightError('10')).toBeNull();
  });

  test('each command status reads as a plain step', () => {
    expect(commandState(null)).toMatchObject({ open: false, severity: 'info' });
    expect(commandState({ Status: 'pending', Action: 'tare' })).toMatchObject({ open: true });
    expect(commandState({ Status: 'sent', Action: 'tare' }).label).toMatch(/radioed/i);
    expect(commandState({ Status: 'done', Action: 'calibrate' })).toMatchObject({ open: false, severity: 'success' });
    expect(commandState({ Status: 'failed', Action: 'calibrate' })).toMatchObject({ open: false, severity: 'error' });
  });

  test('the check step compares the live weight with the test weight', () => {
    expect(calibrationCheck(10.04, 10)).toMatchObject({ ok: true, removed: false });
    expect(calibrationCheck(10.6, 10)).toMatchObject({ ok: false, removed: false });
    expect(calibrationCheck(null, 10)).toBeNull();
  });

  test('a reading far under the test weight means the weight came off, not a bad calibration', () => {
    expect(calibrationCheck(0, 16.8)).toMatchObject({ ok: false, removed: true });
    expect(calibrationCheck(8.3, 16.8)).toMatchObject({ removed: true });
    expect(calibrationCheck(9, 16.8)).toMatchObject({ removed: false });
  });

  test('a user cancel reads as cancelled, not replaced', () => {
    expect(commandState({ Status: 'cancelled', Action: 'calibrate' })).toMatchObject({ open: false, severity: 'warning' });
    expect(commandState({ Status: 'cancelled', Action: 'calibrate' }).label).toMatch(/cancelled/i);
  });
});

describe('while a command is on its way', () => {
  const now = Date.parse('2026-10-26T00:00:40.000Z');

  test('elapsed time reads in seconds, then minutes', () => {
    expect(elapsedLabel('2026-10-26T00:00:34.000Z', now)).toBe('6 s');
    expect(elapsedLabel('2026-10-25T23:58:10.000Z', now)).toBe('2 min');
    expect(elapsedLabel('2026-10-26T00:00:45.000Z', now)).toBe('0 s');
    expect(elapsedLabel(null, now)).toBeNull();
  });

  test('a radioed command says how long and about how many packets it has ridden', () => {
    const sent = { Status: 'sent', Action: 'calibrate', Pounds: 16.8, Sent_At: '2026-10-26T00:00:00.000Z' };
    const status = waitingStatus(sent, 10, now);
    expect(status.label).toBe('Radioed 40 s ago, on about 5 packets so far.');
    expect(status.hint).toBe('Keep the 16.8 lb test weight on the platform until the node answers.');
  });

  test('a fresh downlink and a tare read plainly', () => {
    const tare = { Status: 'sent', Action: 'tare', Sent_At: '2026-10-26T00:00:36.000Z' };
    expect(waitingStatus(tare, 10, now).label).toBe('Radioed to the node with its last packet. Waiting for its answer.');
    expect(waitingStatus(tare, 10, now).hint).toBe('Keep the platform empty until the node answers.');
    expect(waitingStatus({ Status: 'pending', Action: 'tare' }, 10, now).label).toMatch(/next packet/);
    expect(waitingStatus({ Status: 'done', Action: 'tare' }, 10, now)).toBeNull();
  });

  test('the live line shows the weight and how old it is', () => {
    const live = { Weight: 4.64, Recorded_At: '2026-10-26T00:00:34.000Z', Last_Seen: '2026-10-26T00:00:34.000Z', Fault: null };
    expect(liveStatus(live, now)).toEqual({ weight: 'Platform reads 4.64 lb · 6 s ago', fault: null });
    expect(liveStatus({ Weight: null, Recorded_At: null, Last_Seen: null, Fault: null }, now).weight).toBe(
      'No weight from the node yet.',
    );
    expect(liveStatus(null, now)).toEqual({ weight: null, fault: null });
  });

  test('a load-cell fault blocks tare and calibrate; the others warn', () => {
    const fault = (Code) => liveStatus({ Weight: 1, Recorded_At: null, Last_Seen: null, Fault: { Code } }, now).fault;
    expect(fault('load-cell')).toMatchObject({ severity: 'error', blocksCommands: true });
    expect(fault('unstable')).toMatchObject({ severity: 'warning', blocksCommands: false });
    expect(fault('unstable').text).toMatch(/still/);
    expect(fault('reversed')).toMatchObject({ severity: 'warning', blocksCommands: false });
    expect(fault('untared')).toMatchObject({ severity: 'info', blocksCommands: false });
  });

  test('the check only uses a reading taken with or after the ack', () => {
    const done = { Status: 'done', Action: 'calibrate', Pounds: 16.8, Completed_At: '2026-10-26T00:00:20.000Z' };
    const live = (Recorded_At) => ({ Weight: 16.84, Recorded_At, Last_Seen: Recorded_At, Fault: null });
    expect(readingAfterAck(done, live('2026-10-26T00:00:10.000Z'))).toBeNull();
    // The Pi stamps the ack packet a moment before the API settles the command.
    expect(readingAfterAck(done, live('2026-10-26T00:00:18.500Z'))).toEqual(live('2026-10-26T00:00:18.500Z'));
    expect(readingAfterAck(done, live('2026-10-26T00:00:30.000Z'))?.Weight).toBe(16.84);
    expect(readingAfterAck({ ...done, Completed_At: null }, live('2026-10-26T00:00:30.000Z'))).toBeNull();
  });

  test('intervals read in seconds or minutes', () => {
    expect(packetIntervalLabel(10)).toBe('Every 10 seconds');
    expect(packetIntervalLabel(60)).toBe('Every minute');
    expect(packetIntervalLabel(900)).toBe('Every 15 minutes');
    expect(packetIntervalLabel(90)).toBe('Every 90 seconds');
    expect(packetIntervalLabel(null)).toBe('Every 15 minutes');
  });
});

describe('calibration over the mock API', () => {
  test('a calibrate request settles after the node answers', async () => {
    const queued = await send('POST', '/nodes/1/calibration', { Action: 'calibrate', Pounds: 10 });
    expect(queued).toMatchObject({ Action: 'calibrate', Pounds: 10, Status: 'pending' });

    const first = await send('GET', '/nodes/1/calibration');
    expect(first.Command.Status).toBe('sent');
    const second = await send('GET', '/nodes/1/calibration');
    expect(second.Command.Status).toBe('done');
    expect(second.Last_Calibration.Pounds).toBe(10);

    const board = await send('GET', '/nodes/board');
    expect(board.find((node) => node.NodeID === 1).Weight).toBe(10);
  });

  test('the mock reports the live platform and the scale factor like the API', async () => {
    await send('POST', '/nodes/1/calibration', { Action: 'tare' });
    await send('GET', '/nodes/1/calibration');
    const settled = await send('GET', '/nodes/1/calibration');
    expect(settled.Command).toMatchObject({ Action: 'tare', Status: 'done' });
    expect(settled.Last_Scale).toMatchObject({ Action: 'tare', Counts_Per_Lb: 10246 });
    expect(settled.Live).toMatchObject({ Weight: 0, Fault: null });
    expect(settled.Live.Recorded_At).toBe(settled.Command.Completed_At);
  });

  test('cancelling stops a waiting command and answers with it', async () => {
    await send('POST', '/nodes/1/calibration', { Action: 'calibrate', Pounds: 16.8 });
    const cancelled = await send('DELETE', '/nodes/1/calibration');
    expect(cancelled).toMatchObject({ Action: 'calibrate', Status: 'cancelled' });
    const after = await send('GET', '/nodes/1/calibration');
    expect(after.Command).toMatchObject({ CommandID: cancelled.CommandID, Status: 'cancelled' });
  });

  test('calibrate without a weight is rejected like the API', async () => {
    await expect(send('POST', '/nodes/1/calibration', { Action: 'calibrate' })).rejects.toMatchObject({ status: 422 });
  });

  test('the packet interval is set in seconds', async () => {
    const node = await send('PATCH', '/nodes/1/interval', { Report_Interval_Seconds: 10 });
    expect(node.Report_Interval_Seconds).toBe(10);
  });
});
