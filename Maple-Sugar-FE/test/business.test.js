import { describe, expect, test } from 'vitest';

import { percentChange, seasonOf, semesterOf } from '../src/business/aggregation';
import { daysUntilExpiry, expiryStatus, isAccountUsable, Role } from '../src/business/permissions';
import { shelfLifeHours, shelfLifeSeverity, formatShelfLife } from '../src/business/shelfLife';
import { assessSpoilage, hoursAboveThreshold, riskFromTemperature, SpoilageRisk } from '../src/business/spoilage';
import { classifyGrade, classifyReading, estimatedSyrupGallons, isFinished, sapToSyrupRatio, sugarPercentForSyrup } from '../src/business/sugarContent';
import { validateInvite, validateLogin, validateReading, validateSlot } from '../src/business/validation';
import {
  BUCKET_CAPACITY_LB,
  fillPercent,
  flowRate,
  isFull,
  isTipped,
  netWeight,
  totalCollected,
  waterRemovalFraction,
  yieldEfficiency,
} from '../src/business/yieldMetrics';
import { gallons, percent, relativeMinutes, signedPercent } from '../src/components/common/format';
import { ApiError, toUserMessage } from '../src/data/ApiError';
import { navItemsFor } from '../src/routes/navigation';

describe('sap readings on the client', () => {
  test('blocks an incomplete reading and warns on an unusual but legal sugar value', () => {
    const missing = validateReading({});
    expect(missing.isValid).toBe(false);
    expect(missing.errors.NodeID).toBeTruthy();
    expect(missing.errors.Recorded_At).toBeTruthy();

    const unusual = validateReading({
      NodeID: 1,
      Sugar_Percent: 8,
      Recorded_At: '2026-03-01T15:00:00.000Z',
    });
    expect(unusual.isValid).toBe(true);
    expect(unusual.warnings.Sugar_Percent).toMatch(/typical/);
  });

  test('invite, login, and shift forms name the missing field', () => {
    expect(validateInvite({ email: 'not-an-email', roleId: '' }).isValid).toBe(false);
    expect(validateInvite({ email: 'ada@rit.edu', roleId: 2 }).isValid).toBe(true);
    expect(validateLogin({}).errors.password).toMatch(/password/);
    expect(
      validateSlot({
        Task: 'Collect',
        Stand: 'Red Barn',
        Starts_At: '2026-03-11T18:00:00.000Z',
        Ends_At: '2026-03-11T16:00:00.000Z',
        Capacity: 0,
      }).isValid,
    ).toBe(false);
  });
});

describe('spoilage, sugar, and yield', () => {
  test('escalates only after four hours above 40F', () => {
    expect(riskFromTemperature(30)).toBe(SpoilageRisk.SAFE);
    expect(riskFromTemperature(36)).toBe(SpoilageRisk.WATCH);
    expect(riskFromTemperature(null)).toBe(SpoilageRisk.SAFE);

    const brief = assessSpoilage([{ Temperature: 50, Recorded_At: '2026-03-10T18:00:00.000Z' }]);
    expect(brief.risk).toBe(SpoilageRisk.ELEVATED);
    expect(brief.hoursExposed).toBe(0);

    const sustained = assessSpoilage([
      { Temperature: 50, Recorded_At: '2026-03-10T18:00:00.000Z' },
      { Temperature: 48, Recorded_At: '2026-03-10T12:00:00.000Z' },
      { Temperature: 20, Recorded_At: '2026-03-10T06:00:00.000Z' },
    ]);
    expect(hoursAboveThreshold(sustained ? [
      { Temperature: 50, Recorded_At: '2026-03-10T18:00:00.000Z' },
      { Temperature: 48, Recorded_At: '2026-03-10T12:00:00.000Z' },
    ] : [])).toBe(6);
    expect(sustained.risk).toBe(SpoilageRisk.CRITICAL);
    expect(sustained.reason).toMatch(/Collect or discard/);
  });

  test('grades syrup and applies the rule of 86', () => {
    expect(sapToSyrupRatio(2)).toBe(43);
    expect(sapToSyrupRatio(0)).toBeNull();
    expect(estimatedSyrupGallons(10)).toBeCloseTo(0.25, 5);
    expect(estimatedSyrupGallons(10, 2)).toBeCloseTo(10 / 43, 5);
    expect(sugarPercentForSyrup(10, 0.25)).toBeCloseTo(2.15, 5);
    expect(isFinished(66.9)).toBe(true);
    expect(isFinished(2)).toBe(false);
    expect(classifyGrade(80)).toMatch(/Golden/);
    expect(classifyGrade(10)).toMatch(/Very Dark/);
    expect(classifyGrade(null)).toBeNull();
    expect(classifyReading(2.2).level).toBe('typical');
    expect(classifyReading(0.2).level).toBe('implausible');
  });

  test('net weight, a full bucket, a tipover, and boil-off', () => {
    expect(netWeight(12, 2)).toBe(10);
    expect(netWeight(1, 2)).toBe(0);
    expect(isTipped(0.4, 2)).toBe(true);
    expect(isFull(2 + BUCKET_CAPACITY_LB, 2)).toBe(true);
    expect(fillPercent(2 + BUCKET_CAPACITY_LB / 2, 2)).toBeCloseTo(50, 5);
    expect(waterRemovalFraction(2)).toBeCloseTo(1 - 2 / 66.9, 5);
    expect(yieldEfficiency(2)).toBeCloseTo(100 / 43, 5);
    expect(totalCollected([{ Volume_Collected: 1.5 }, { Volume_Collected: null }, {}])).toBe(1.5);

    const rate = flowRate(
      { Weight: 10, Recorded_At: '2026-03-10T12:00:00.000Z' },
      { Weight: 16, Recorded_At: '2026-03-10T15:00:00.000Z' },
    );
    expect(rate).toBe(2);
    expect(
      flowRate(
        { Weight: 16, Recorded_At: '2026-03-10T12:00:00.000Z' },
        { Weight: 4, Recorded_At: '2026-03-10T15:00:00.000Z' },
      ),
    ).toBe(0);
  });

  test('shelf life halves as the sap warms and expires on the clock', () => {
    expect(shelfLifeHours(32)).toBe(96);
    expect(shelfLifeHours(42)).toBe(48);
    expect(shelfLifeHours(42, 4)).toBeLessThan(48);
    expect(formatShelfLife(0)).toBe('Expired');
    expect(formatShelfLife(null)).toBe('Unknown');
    expect(shelfLifeSeverity(6)).toBe('error');
    expect(shelfLifeSeverity(30)).toBe('success');
  });
});

describe('seasons and display', () => {
  test('June stays in the current season and July opens the next', () => {
    expect(seasonOf('2026-06-15T12:00:00.000Z')).toBe(2026);
    expect(seasonOf('2026-07-15T12:00:00.000Z')).toBe(2027);
    expect(semesterOf('2026-03-15T12:00:00.000Z')).toBe('spring');
    expect(semesterOf('2026-10-15T12:00:00.000Z')).toBe('fall');
  });

  test('percent change refuses a zero baseline', () => {
    expect(percentChange(15, 10)).toBe(50);
    expect(percentChange(15, 0)).toBeNull();
  });

  test('formatters do not invent a number for a missing reading', () => {
    expect(percent(null)).toBe('—');
    expect(gallons(1)).toBe('1.00 gal');
    expect(relativeMinutes(0)).toBe('just now');
    expect(relativeMinutes(90)).toBe('2 hr ago');
    expect(signedPercent(-3.2)).toBe('-3.2%');
    expect(signedPercent(3.2)).toBe('+3.2%');
  });
});

describe('who can see what', () => {
  const now = new Date('2026-03-10T15:00:00.000Z');

  test('an expired student is locked even though the role would otherwise work', () => {
    expect(isAccountUsable({ Is_Active: true, Account_Expiry: '2020-01-01T00:00:00.000Z' }, now)).toBe(false);
    expect(daysUntilExpiry({ Account_Expiry: '2026-03-20T15:00:00.000Z' }, now)).toBe(10);
    expect(expiryStatus({ Is_Active: true, Account_Expiry: '2026-03-20T15:00:00.000Z' }, now).level).toBe('warning');
    expect(expiryStatus({ Is_Active: false }, now).label).toBe('Locked');
  });

  test('the nav hides admin and schedule pages from an MSS member', () => {
    const labels = navItemsFor(Role.MSS).map((item) => item.label);
    expect(labels).toContain('The Bush');
    expect(labels).toContain('Sugar Woods');
    expect(labels).not.toContain('Admin');
    expect(labels).not.toContain('Schedule');
    expect(labels).not.toContain('Collection');

    const student = navItemsFor(Role.STUDENT).map((item) => item.to);
    expect(student).toContain('/schedule');
    expect(student).not.toContain('/admin');
  });

  test('a raw exception is not shown to the user', () => {
    expect(toUserMessage(new Error('connect ECONNREFUSED 10.1.2.3:5432'))).toBe(
      'Something went wrong. Please try again.',
    );
    expect(toUserMessage(new ApiError('down', { code: 'NETWORK' }))).toMatch(/Cannot reach the server/);
    expect(toUserMessage(new ApiError('no', { status: 401 }))).toMatch(/sign in again/i);
    expect(new ApiError('no', { status: 403 }).isForbidden).toBe(true);
    expect(new ApiError('no', { status: 422 }).isValidation).toBe(true);
  });
});
