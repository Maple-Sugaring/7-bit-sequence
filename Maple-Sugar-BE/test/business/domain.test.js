import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  deriveAlerts,
  hoursAboveThreshold,
} from '../../src/business/alerting.js';
import {
  describeSapChange,
  poundsFromGallons,
  sapRunFromTemps,
} from '../../src/business/sapFlow.js';
import { seasonOf } from '../../src/business/season.js';
import { offsetForStand, SITE_NAMES } from '../../src/business/sites.js';
import {
  BUCKET_CAPACITY_LB,
  CRITICAL_EXPOSURE_HOURS,
  FULL_MARGIN_LB,
  LB_PER_GALLON,
  SPOILAGE_THRESHOLD_F,
} from '../../src/business/thresholds.js';
import { validateCollectionLog, validateReading } from '../../src/business/validation.js';
import {
  suggestCollectionWindows,
  validateChosenWindow,
  zonedTimeToUtc,
} from '../../src/business/availability.js';

const at = (iso) => ({ Temperature: 50, Recorded_At: iso });

describe('sap season', () => {
  test('readings through June stay in the current season', () => {
    assert.equal(seasonOf('2026-06-30T23:00:00.000Z'), 2026);
  });

  test('July opens the following season, in UTC', () => {
    assert.equal(seasonOf('2026-07-01T00:00:00.000Z'), 2027);
  });

  test('an unparseable date does not invent a season', () => {
    assert.equal(seasonOf('not-a-date'), null);
  });
});

describe('reading validation', () => {
  const valid = {
    NodeID: 3,
    Weight: 40,
    Sugar_Percent: 2.2,
    Temperature: 36,
    Recorded_At: '2026-03-01T15:00:00.000Z',
  };

  test('accepts a complete liquid reading', () => {
    assert.equal(validateReading(valid).isValid, true);
  });

  test('requires a tree and at least one measurement', () => {
    const result = validateReading({ Temperature: 30 });
    assert.equal(result.isValid, false);
    assert.ok(result.errors.NodeID);
    assert.ok(result.errors.Sugar_Percent);
  });

  test('rejects sugar outside the raw-sap band and non-numeric weight', () => {
    const result = validateReading({
      ...valid,
      Sugar_Percent: 40,
      Weight: 'heavy',
    });
    assert.match(result.errors.Sugar_Percent, /0\.5% and 12%/);
    assert.match(result.errors.Weight, /number/);
  });

  test('rejects a negative weight and a liquid bucket past the ice ceiling', () => {
    const negative = validateReading({ ...valid, Weight: -1 });
    assert.match(negative.errors.Weight, /negative/);

    const overflow = validateReading({ ...valid, Weight: BUCKET_CAPACITY_LB + 9, Ice_Present: false });
    assert.match(overflow.errors.Weight, /10 gallons/);

    const iced = validateReading({ ...valid, Weight: 200, Ice_Present: true });
    assert.match(iced.errors.Weight, /ice/i);
  });

  test('rejects temperatures outside a Rochester season and future timestamps', () => {
    const cold = validateReading({ ...valid, Temperature: -40 });
    assert.match(cold.errors.Temperature, /-30F and 90F/);

    const future = validateReading({
      ...valid,
      Recorded_At: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    assert.match(future.errors.Recorded_At, /future/);
  });

  test('allows a clock that is slightly fast', () => {
    const result = validateReading({
      ...valid,
      Recorded_At: new Date(Date.now() + 20_000).toISOString(),
    });
    assert.equal(result.errors.Recorded_At, undefined);
  });
});

describe('collection log validation', () => {
  test('requires a tree, a bucket, and a positive volume', () => {
    const blank = validateCollectionLog({});
    assert.equal(blank.isValid, false);
    assert.ok(blank.errors.NodeID);
    assert.ok(blank.errors.BucketID);
    assert.ok(blank.errors.Volume_Collected);

    const zero = validateCollectionLog({ NodeID: 1, BucketID: 2, Volume_Collected: 0 });
    assert.match(zero.errors.Volume_Collected, /greater than zero/);
  });
});

describe('spoilage alerts', () => {
  test('a single warm reading is not yet an alert', () => {
    const hours = hoursAboveThreshold([at('2026-03-10T18:00:00.000Z')]);
    assert.equal(hours, 0);

    const alerts = deriveAlerts({
      reading: { NodeID: 1, Temperature: 55, Recorded_At: '2026-03-10T18:00:00.000Z' },
    });
    assert.deepEqual(alerts, []);
  });

  test('counts only the span that stayed above the threshold', () => {
    const hours = hoursAboveThreshold([
      at('2026-03-10T18:00:00.000Z'),
      at('2026-03-10T12:00:00.000Z'),
      { Temperature: 30, Recorded_At: '2026-03-10T06:00:00.000Z' },
    ]);
    assert.equal(hours, 6);
    assert.ok(hours >= CRITICAL_EXPOSURE_HOURS);
  });

  test('the newest safe reading resets exposure', () => {
    assert.equal(
      hoursAboveThreshold([
        { Temperature: SPOILAGE_THRESHOLD_F, Recorded_At: '2026-03-10T18:00:00.000Z' },
        at('2026-03-10T12:00:00.000Z'),
      ]),
      0,
    );
  });

  test('raises spoilage, a full bucket, and a tipover from the reading', () => {
    const spoilage = deriveAlerts({
      reading: {
        NodeID: 4,
        Node_Name: 'North maple',
        Temperature: 48,
        Recorded_At: '2026-03-10T18:00:00.000Z',
      },
      history: [{ Temperature: 47, Recorded_At: '2026-03-10T12:00:00.000Z' }],
    });
    assert.equal(spoilage[0].Alert_Type, 'Spoilage');
    assert.equal(spoilage[0].severity, 'critical');
    assert.match(spoilage[0].Description, /North maple/);

    const tare = 2;
    const full = deriveAlerts({
      reading: {
        NodeID: 4,
        Node_Name: 'North maple',
        Weight: tare + BUCKET_CAPACITY_LB - FULL_MARGIN_LB,
        Ice_Present: false,
        Recorded_At: '2026-03-10T18:00:00.000Z',
      },
      tareWeight: tare,
    });
    assert.equal(full[0].Alert_Type, 'Full Bucket');
    assert.match(full[0].Description, /10 gallon/);

    const iced = deriveAlerts({
      reading: {
        NodeID: 4,
        Weight: tare + BUCKET_CAPACITY_LB,
        Ice_Present: true,
        Recorded_At: '2026-03-10T18:00:00.000Z',
      },
      tareWeight: tare,
    });
    assert.match(iced[0].Description, /Ice is tagged/);

    const tipped = deriveAlerts({
      reading: { NodeID: 4, Weight: tare * 0.4, Recorded_At: '2026-03-10T18:00:00.000Z' },
      tareWeight: tare,
    });
    assert.equal(tipped[0].Alert_Type, 'Tipped');
    assert.equal(tipped[0].severity, 'critical');
  });
});

describe('sap flow', () => {
  test('a freeze followed by a thaw produces a run', () => {
    const run = sapRunFromTemps({ tempMinF: 20, tempMaxF: 45, precipIn: 0 });
    assert.equal(run.sapRun, true);
    assert.equal(run.ice, false);
    assert.equal(run.flowGal, 1.5);
    assert.equal(run.sugar, 2.3);
    assert.equal(run.flowIndex, 0.577);
  });

  test('no overnight freeze means no run', () => {
    const run = sapRunFromTemps({ tempMinF: 40, tempMaxF: 50 });
    assert.equal(run.sapRun, false);
    assert.equal(run.flowGal, 0);
    assert.equal(run.sugar, null);
  });

  test('a hot afternoon cuts the run and rain adds volume while diluting sugar', () => {
    const hot = sapRunFromTemps({ tempMinF: 20, tempMaxF: 60 });
    assert.equal(hot.flowGal, 1.18);

    const wet = sapRunFromTemps({ tempMinF: 20, tempMaxF: 45, precipIn: 0.3 });
    assert.equal(wet.flowGal, 1.68);
    assert.equal(wet.sugar, 2.05);
  });

  test('describes a building run against the previous snapshot', () => {
    const today = { ...sapRunFromTemps({ tempMinF: 18, tempMaxF: 46 }), tempMinF: 18, tempMaxF: 46 };
    const change = describeSapChange({ today, previous: { sapRun: false, flowIndex: 0 } });
    assert.equal(change.increased, true);
    assert.equal(change.flowChange, 'up');

    const quiet = describeSapChange({
      today: { sapRun: false, tempMinF: 40, tempMaxF: 48 },
      previous: { sapRun: true },
    });
    assert.equal(quiet.flowChange, 'down');
    assert.match(quiet.summary, /No sap run/);
  });

  test('converts gallons with the sap density used by the bucket math', () => {
    assert.equal(poundsFromGallons(10), 10 * LB_PER_GALLON);
  });
});

describe('collection windows', () => {
  test('converts sugarbush wall time to UTC across the DST boundary', () => {
    assert.equal(zonedTimeToUtc('2026-01-15', 12).toISOString(), '2026-01-15T17:00:00.000Z');
    assert.equal(zonedTimeToUtc('2026-07-15', 12).toISOString(), '2026-07-15T16:00:00.000Z');
  });

  test('skips blocks that already started and blocks that overlap a calendar event', () => {
    const now = new Date('2026-03-10T15:00:00.000Z');
    const windows = suggestCollectionWindows({
      now,
      days: 1,
      limit: 12,
      busy: [{ start: '2026-03-10T16:00:00.000Z', end: '2026-03-10T18:00:00.000Z' }],
    });

    assert.ok(windows.length > 0);
    for (const window of windows) {
      assert.ok(new Date(window.Starts_At).getTime() - now.getTime() >= 30 * 60 * 1000);
      const start = new Date(window.Starts_At);
      const end = new Date(window.Ends_At);
      const overlapsNoon = start < new Date('2026-03-10T18:00:00.000Z') && end > new Date('2026-03-10T16:00:00.000Z');
      assert.equal(overlapsNoon, false);
    }
  });

  test('rejects a chosen shift that is too short, in the past, or busy', () => {
    const now = new Date('2026-03-10T15:00:00.000Z');
    assert.match(
      validateChosenWindow({
        startsAt: '2026-03-10T16:00:00.000Z',
        endsAt: '2026-03-10T16:10:00.000Z',
        now,
      }),
      /30 minutes/,
    );
    assert.match(
      validateChosenWindow({
        startsAt: '2026-03-10T12:00:00.000Z',
        endsAt: '2026-03-10T14:00:00.000Z',
        now,
      }),
      /already passed/,
    );
    assert.match(
      validateChosenWindow({
        startsAt: '2026-03-11T16:00:00.000Z',
        endsAt: '2026-03-11T18:00:00.000Z',
        now,
        busy: [{ Start: '2026-03-11T17:00:00.000Z', End: '2026-03-11T17:30:00.000Z' }],
      }),
      /overlaps/,
    );
    assert.equal(
      validateChosenWindow({
        startsAt: '2026-03-11T16:00:00.000Z',
        endsAt: '2026-03-11T18:00:00.000Z',
        now,
      }),
      null,
    );
  });
});

describe('campus sites', () => {
  test('names the three stands and returns each offset', () => {
    assert.deepEqual(SITE_NAMES, ['Alumni House', 'Chabad House', 'Red Barn']);
    assert.equal(offsetForStand('Red Barn'), -0.8);
    assert.equal(offsetForStand('somewhere else'), 0);
  });
});
