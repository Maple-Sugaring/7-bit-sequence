import { describe, expect, test } from 'vitest';

import {
  MAX_TEST_POUNDS,
  MIN_TEST_POUNDS,
  calibrationCheck,
  commandState,
  packetIntervalLabel,
  testWeightError,
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
    expect(calibrationCheck(10.04, 10)).toMatchObject({ ok: true });
    expect(calibrationCheck(10.6, 10)).toMatchObject({ ok: false });
    expect(calibrationCheck(null, 10)).toBeNull();
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

  test('calibrate without a weight is rejected like the API', async () => {
    await expect(send('POST', '/nodes/1/calibration', { Action: 'calibrate' })).rejects.toMatchObject({ status: 422 });
  });

  test('the packet interval is set in seconds', async () => {
    const node = await send('PATCH', '/nodes/1/interval', { Report_Interval_Seconds: 10 });
    expect(node.Report_Interval_Seconds).toBe(10);
  });
});
