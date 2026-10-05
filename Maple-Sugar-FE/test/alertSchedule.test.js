import { describe, expect, test } from 'vitest';

import { schedulePathForAlert, taskForAlert } from '../src/business/alertSchedule';

describe('alert to schedule', () => {
  test('a full bucket opens a sap collection for that tree', () => {
    const path = schedulePathForAlert({
      NodeID: 2,
      Alert_Type: 'Full Bucket',
      nodeName: 'Alumni House - Tree 2',
      stand: 'Alumni House',
      barcode: 'BKT-002',
      Description: 'Net sap is 9.7 gal at Alumni House - Tree 2, at the 10 gallon bucket capacity.',
    });
    const params = new URLSearchParams(path.split('?')[1]);
    expect(path.startsWith('/schedule-admin?')).toBe(true);
    expect(params.get('nodeId')).toBe('2');
    expect(params.get('task')).toBe('Sap Collection');
    expect(params.get('notes')).toBe('Bucket - 2 is full at Alumni House.');
  });

  test('battery and signal alerts pick a matching task', () => {
    expect(taskForAlert('Low Battery')).toBe('Battery Swap');
    expect(taskForAlert('Signal Loss')).toBe('Sensor Check');
    expect(taskForAlert('Ice Storm')).toBe('Maintenance');
  });
});
