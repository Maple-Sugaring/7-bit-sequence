import { describe, expect, test } from 'vitest';
import { lastFillNote } from '../src/business/bucketAlerts';
import { MapStatus, statusByNodeId, weightIsStale } from '../src/business/nodeMapStatus';
import {
  BucketLevel,
  COLLECTION_NEEDED_FRACTION,
  LB_PER_GALLON,
  bucketLevel,
  needsCollection,
} from '../src/business/yieldMetrics';

const TARE = 2.2;
const gross = (gallons) => TARE + gallons * LB_PER_GALLON;

describe('bucket level (FR-003)', () => {
  test('warns to collect before the bucket is full', () => {
    expect(bucketLevel(gross(5), TARE)).toBe(BucketLevel.OK);
    expect(bucketLevel(gross(10 * COLLECTION_NEEDED_FRACTION - 0.1), TARE)).toBe(BucketLevel.OK);
    expect(bucketLevel(gross(10 * COLLECTION_NEEDED_FRACTION + 0.01), TARE)).toBe(BucketLevel.COLLECT);
    expect(bucketLevel(gross(8.1), TARE)).toBe(BucketLevel.COLLECT);
    expect(needsCollection(gross(8.1), TARE)).toBe(true);
  });

  test('full takes over from collect near the rim', () => {
    expect(bucketLevel(gross(9.6), TARE)).toBe(BucketLevel.FULL);
    expect(needsCollection(gross(9.6), TARE)).toBe(false);
  });

  test('no weight means no level', () => {
    expect(bucketLevel(null, TARE)).toBeNull();
  });
});

describe('stale weights (FR-003)', () => {
  const seen = '2026-03-01T00:00:00Z';

  test('an offline or stale node has a weight that is out of date', () => {
    expect(weightIsStale({ Last_Seen: seen, mapStatus: MapStatus.OFFLINE })).toBe(true);
    expect(weightIsStale({ Last_Seen: seen, mapStatus: MapStatus.STALE })).toBe(true);
  });

  test('an offline alert carries the last fill, and says to check a heavy bucket', () => {
    expect(lastFillNote({ grossWeight: gross(8.4), tareWeight: TARE })).toMatch(/8\.4 gal \(84%\).*possibly full/);
    expect(lastFillNote({ grossWeight: gross(3), tareWeight: TARE })).not.toMatch(/possibly full/);
    expect(lastFillNote({ grossWeight: null, tareWeight: TARE })).toBe('');
  });

  test('live, maintenance and never-reported nodes are not flagged', () => {
    expect(weightIsStale({ Last_Seen: seen, mapStatus: MapStatus.ONLINE })).toBe(false);
    expect(weightIsStale({ Last_Seen: seen, mapStatus: MapStatus.MAINTENANCE })).toBe(false);
    expect(weightIsStale({ Last_Seen: null, mapStatus: MapStatus.OFFLINE })).toBe(false);
  });
});

describe('load-cell faults on the map (EIR-001)', () => {
  test('a node reporting a load-cell fault is degraded, not online', () => {
    const now = new Date('2026-03-01T12:00:00Z');
    const node = { NodeID: 4, Status_Code: 1, Last_Seen: '2026-03-01T11:55:00Z' };
    const alert = (type) => [{ NodeID: 4, Alert_Type: type, Is_Resolved: false }];

    expect(statusByNodeId([node], [], now).get(4)).toBe(MapStatus.ONLINE);
    for (const type of ['Load Cell', 'Reversed Load Cell', 'Untared', 'Unstable Reading']) {
      expect(statusByNodeId([node], alert(type), now).get(4)).toBe(MapStatus.DEGRADED);
    }
  });
});
