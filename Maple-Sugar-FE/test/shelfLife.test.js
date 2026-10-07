import { describe, expect, test } from 'vitest';

import { bucketBatch, shelfLifeByBucket } from '../src/business/shelfLife';

const NOW = new Date('2026-10-07T12:00:00.000Z');
const hoursAgo = (hours) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

const bucket = { BucketID: 1, Barcode_ID: 'BKT-001', NodeID: 1, Status: 'At Tree', Tare_Weight: 2 };

// Gross weight; the tare is 2 lb, so 22 lb gross is 20 lb of sap.
const reading = (ago, weight, extra = {}) => ({
  BucketID: 1,
  NodeID: 1,
  Weight: weight,
  Recorded_At: hoursAgo(ago),
  Temperature: null,
  Sugar_Percent: null,
  ...extra,
});

describe('a bucket with no sap', () => {
  test('has no shelf life when it has never reported', () => {
    const batch = bucketBatch({ bucket, readings: [], now: NOW, ambientF: 40 });
    expect(batch.state).toBe('empty');
    expect(batch.hours).toBeNull();
    expect(batch.label).toBe('No sap');
  });

  test('has none while the latest reading is at tare', () => {
    const batch = bucketBatch({ bucket, readings: [reading(2, 2), reading(1, 2.3)], now: NOW, ambientF: 40 });
    expect(batch.state).toBe('empty');
  });

  test('has none in storage or cleaning, whatever it last weighed', () => {
    for (const Status of ['Storage', 'Cleaning']) {
      const batch = bucketBatch({ bucket: { ...bucket, Status }, readings: [reading(1, 30)], now: NOW, ambientF: 40 });
      expect(batch.state).toBe('empty');
    }
  });
});

describe('where a batch starts', () => {
  test('starts at the first reading with sap after the bucket was last emptied', () => {
    const batch = bucketBatch({
      bucket,
      readings: [reading(30, 40), reading(20, 2), reading(10, 8), reading(5, 12)],
      now: NOW,
      ambientF: 32,
    });
    expect(batch.state).toBe('active');
    expect(batch.startedAt).toBe(hoursAgo(10));
    expect(batch.ageHours).toBeCloseTo(10);
  });

  test('a logged collection ends the batch even without a tare reading', () => {
    const readings = [reading(20, 10), reading(10, 20)];
    const emptied = bucketBatch({ bucket, readings, collections: [{ BucketID: 1, Collected_At: hoursAgo(4) }], now: NOW, ambientF: 32 });
    expect(emptied.state).toBe('empty');

    const refilled = bucketBatch({
      bucket,
      readings: [...readings, reading(2, 6)],
      collections: [{ BucketID: 1, Collected_At: hoursAgo(4) }],
      now: NOW,
      ambientF: 32,
    });
    expect(refilled.startedAt).toBe(hoursAgo(2));
  });

  test('ignores a collection logged for a different bucket', () => {
    const batch = bucketBatch({
      bucket,
      readings: [reading(10, 20)],
      collections: [{ BucketID: 2, Collected_At: hoursAgo(4) }],
      now: NOW,
      ambientF: 32,
    });
    expect(batch.state).toBe('active');
  });
});

describe('how the window is used up', () => {
  test('cold sap barely uses any of the window', () => {
    const batch = bucketBatch({
      bucket,
      readings: [
        reading(12, 20, { Temperature: 30 }),
        reading(8, 24, { Temperature: 30 }),
        reading(4, 27, { Temperature: 30 }),
        reading(0, 30, { Temperature: 30 }),
      ],
      now: NOW,
      ambientF: 30,
    });
    // 12 of 96 hours spent, the rest of a 96 hour window left.
    expect(batch.hours).toBeCloseTo(84);
    expect(batch.source).toBe('sap temperature');
  });

  test('sap held at 52F has a 24 hour window, and 12 hours spent leaves 12', () => {
    const batch = bucketBatch({
      bucket,
      readings: [reading(12, 20, { Temperature: 52 }), reading(0, 30, { Temperature: 52 })],
      now: NOW,
      ambientF: 52,
    });
    expect(batch.hours).toBeCloseTo(12);
  });

  test('a cold night recovers time that a single warm reading would not', () => {
    const warmThenCold = bucketBatch({
      bucket,
      readings: [reading(8, 20, { Temperature: 52 }), reading(4, 24, { Temperature: 30 }), reading(0, 28, { Temperature: 30 })],
      now: NOW,
      ambientF: 30,
    });
    const allWarm = bucketBatch({
      bucket,
      readings: [reading(8, 20, { Temperature: 52 }), reading(4, 24, { Temperature: 52 }), reading(0, 28, { Temperature: 52 })],
      now: NOW,
      ambientF: 52,
    });
    expect(warmThenCold.hours).toBeGreaterThan(allWarm.hours * 3);
  });

  test('falls back to air temperature, charging the whole age at that rate', () => {
    const batch = bucketBatch({ bucket, readings: [reading(6, 20)], now: NOW, ambientF: 62 });
    // 62F gives a 12 hour window; 6 hours used.
    expect(batch.hours).toBeCloseTo(6);
    expect(batch.source).toBe('air temperature');
  });

  test('a sap temperature reading goes stale after six hours', () => {
    const batch = bucketBatch({
      bucket,
      readings: [reading(10, 20, { Temperature: 30 })],
      now: NOW,
      ambientF: 62,
    });
    // 6 hours at 30F (6/96) then 4 hours at 62F (4/12).
    const used = 6 / 96 + 4 / 12;
    expect(batch.hours).toBeCloseTo((1 - used) * 12);
    expect(batch.source).toBe('sap and air temperature');
  });

  test('reports expired once the window is gone', () => {
    const batch = bucketBatch({ bucket, readings: [reading(30, 20)], now: NOW, ambientF: 62 });
    expect(batch.hours).toBe(0);
    expect(batch.label).toBe('Expired');
    expect(batch.severity).toBe('error');
  });

  test('is unknown rather than guessed when no temperature is available', () => {
    const batch = bucketBatch({ bucket, readings: [reading(6, 20)], now: NOW, ambientF: null });
    expect(batch.state).toBe('unknown');
    expect(batch.hours).toBeNull();
    expect(batch.label).toBe('Unknown');
  });

  test('a high Brix reading shortens the window', () => {
    const plain = bucketBatch({ bucket, readings: [reading(1, 20)], now: NOW, ambientF: 52 });
    const sweet = bucketBatch({ bucket, readings: [reading(1, 20, { Sugar_Percent: 5 })], now: NOW, ambientF: 52 });
    expect(sweet.hours).toBeLessThan(plain.hours);
  });

  test('flags a batch that has been above the 40F spoilage line', () => {
    const warm = bucketBatch({ bucket, readings: [reading(2, 20, { Temperature: 45 })], now: NOW, ambientF: 30 });
    const cold = bucketBatch({ bucket, readings: [reading(2, 20, { Temperature: 33 })], now: NOW, ambientF: 30 });
    expect(warm.exceededThreshold).toBe(true);
    expect(cold.exceededThreshold).toBe(false);
  });
});

describe('tracking by bucket, not by node', () => {
  const second = { BucketID: 2, Barcode_ID: 'BKT-002', NodeID: null, Status: 'In Transit', Tare_Weight: 2 };

  test('keeps each bucket on its own clock', () => {
    const readings = [
      reading(20, 2),
      reading(18, 10),
      reading(1, 20),
      { ...reading(3, 12), BucketID: 2 },
    ];
    const byBucket = shelfLifeByBucket({ readings, buckets: [bucket, second], now: NOW, ambientF: 52 });

    expect(byBucket.get(1).startedAt).toBe(hoursAgo(18));
    expect(byBucket.get(2).startedAt).toBe(hoursAgo(3));
    expect(byBucket.get(1).hours).toBeLessThan(byBucket.get(2).hours);
  });

  test('follows a bucket onto another node without restarting its clock', () => {
    const readings = [reading(10, 10, { NodeID: 1 }), reading(4, 14, { NodeID: 3 })];
    const batch = shelfLifeByBucket({ readings, buckets: [bucket], now: NOW, ambientF: 52 }).get(1);

    expect(batch.startedAt).toBe(hoursAgo(10));
    expect(batch.nodeId).toBe(3);
  });

  test('a swapped-in empty bucket does not inherit the old bucket\'s sap', () => {
    const readings = [reading(10, 30), { ...reading(1, 2), BucketID: 2, NodeID: 1 }];
    const byBucket = shelfLifeByBucket({ readings, buckets: [bucket, { ...second, NodeID: 1, Status: 'At Tree' }], now: NOW, ambientF: 52 });

    expect(byBucket.get(2).state).toBe('empty');
    expect(byBucket.get(1).state).toBe('active');
  });
});
