import { describe, expect, test } from 'vitest';

import { seasonOf as clientSeason } from '../src/business/aggregation';
import { Capability as ClientCapability, Role as ClientRole, can as clientCan } from '../src/business/permissions';
import { CRITICAL_EXPOSURE_HOURS as clientHours, SPOILAGE_THRESHOLD_F as clientSpoilage } from '../src/business/spoilage';
import { FINISHED_SUGAR_PERCENT as clientFinished, RAW_SAP_MAX_PERCENT, RAW_SAP_MIN_PERCENT } from '../src/business/sugarContent';
import { validateReading as clientValidate } from '../src/business/validation';
import { BUCKET_CAPACITY_LB as clientBucket, LB_PER_GALLON as clientDensity } from '../src/business/yieldMetrics';
import { cacheKeys as clientKeys, hashFilters as clientHash, TTL as clientTtl } from '../src/data/cache/cacheKeys';
import { can as serverCan, Capability as ServerCapability, Role as ServerRole } from '../../Maple-Sugar-BE/src/business/permissions.js';
import { seasonOf as serverSeason } from '../../Maple-Sugar-BE/src/business/season.js';
import {
  BUCKET_CAPACITY_LB as serverBucket,
  CRITICAL_EXPOSURE_HOURS as serverHours,
  FINISHED_SUGAR_PERCENT as serverFinished,
  LB_PER_GALLON as serverDensity,
  RAW_SAP_MAX_PERCENT as serverSugarMax,
  RAW_SAP_MIN_PERCENT as serverSugarMin,
  SPOILAGE_THRESHOLD_F as serverSpoilage,
} from '../../Maple-Sugar-BE/src/business/thresholds.js';
import { validateReading as serverValidate } from '../../Maple-Sugar-BE/src/business/validation.js';
import { cacheKeys as serverKeys, hashFilters as serverHash, TTL as serverTtl } from '../../Maple-Sugar-BE/src/cache/cacheKeys.js';

describe('client and server agree', () => {
  test('physical constants and cache keys are the same values', () => {
    expect(clientSpoilage).toBe(serverSpoilage);
    expect(clientHours).toBe(serverHours);
    expect(clientFinished).toBe(serverFinished);
    expect(clientBucket).toBe(serverBucket);
    expect(clientDensity).toBe(serverDensity);
    expect(RAW_SAP_MIN_PERCENT).toBe(serverSugarMin);
    expect(RAW_SAP_MAX_PERCENT).toBe(serverSugarMax);
    expect(clientTtl).toEqual(serverTtl);
    expect(clientKeys.metricsList('all')).toBe(serverKeys.metricsList('all'));
    expect(clientKeys.scheduleSlots('any', 'any')).toBe(serverKeys.scheduleSlots('any', 'any'));
    expect(clientHash({ b: 1, a: 2, empty: '' })).toBe(serverHash({ b: 1, a: 2, empty: '' }));
  });

  test('the capability matrix matches for every role', () => {
    expect(ClientRole).toEqual(ServerRole);
    expect(ClientCapability).toEqual(ServerCapability);
    for (const role of Object.values(ClientRole)) {
      for (const capability of Object.values(ClientCapability)) {
        expect(clientCan(role, capability)).toBe(serverCan(role, capability));
      }
    }
  });

  test('a noon UTC date lands in the same season, and the same bad reading is rejected', () => {
    expect(clientSeason('2026-06-15T12:00:00.000Z')).toBe(serverSeason('2026-06-15T12:00:00.000Z'));
    expect(clientSeason('2026-07-15T12:00:00.000Z')).toBe(serverSeason('2026-07-15T12:00:00.000Z'));

    const reading = {
      NodeID: 1,
      Sugar_Percent: 'nope',
      Weight: -4,
      Temperature: 120,
      Recorded_At: '2026-03-01T15:00:00.000Z',
    };
    const client = clientValidate(reading);
    const server = serverValidate(reading);
    expect(client.isValid).toBe(false);
    expect(server.isValid).toBe(false);
    expect(client.errors.Sugar_Percent).toBe(server.errors.Sugar_Percent);
    expect(client.errors.Weight).toBe(server.errors.Weight);
    expect(client.errors.Temperature).toBe(server.errors.Temperature);
  });
});
