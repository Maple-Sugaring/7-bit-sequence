import { describe, expect, it } from 'vitest';
import { healthReading, lifecycleCsv, lifecycleRow, SENSOR_KIT } from '../src/business/sensorLifecycle';

const today = '2026-11-08';
const budget = { kitCost: 20, serviceYears: 3 };

describe('sensor lifecycle budgeting', () => {
  it('keeps aging based on the active sensor and skips maintenance', () => {
    const plan = lifecycleRow({
      History: [
        { date: '2026-11-07', type: 'maintenance' },
        { date: '2026-11-05', type: 'replacement', sensorType: SENSOR_KIT },
        { date: '2026-10-25', type: 'installation', sensorType: SENSOR_KIT, assumed: true },
      ],
    }, budget, today);
    expect(plan).toMatchObject({ ageDays: 3, due: '2029-11-05', cost: 24.95 });
  });

  it('shows unknown installation and budget data without assigning a zero cost', () => {
    expect(lifecycleRow({ History: [] }, budget, today)).toMatchObject({ ageDays: null, due: null, cost: null });
    expect(lifecycleRow({ History: [{ date: '2026-11-05', type: 'installation', sensorType: 'Other' }] },
      budget, today)).toMatchObject({ ageDays: 3, due: null, cost: null });
  });

  it('distinguishes unknown, stale and low readings', () => {
    const reportedAt = '2026-11-08T12:00:00Z';
    const now = Date.parse(reportedAt) + 20000;
    expect(healthReading(null, '%', null, 10, null, now)).toBe('Unknown');
    expect(healthReading(17, '%', null, 10, 'low battery', now)).toBe('17% (low battery, freshness unknown)');
    expect(healthReading(0, '%', reportedAt, 10, 'low battery', now)).toBe('0% (low battery, stale)');
    expect(healthReading(-111, ' dBm', reportedAt, 30, 'weak signal', now)).toBe('-111 dBm (weak signal)');
  });

  it('escapes editable labels when exporting the report', () => {
    const node = { Name: '=SUM(1,2)', History: [] };
    const plan = lifecycleRow(node, budget, today);
    expect(lifecycleCsv([{ node, plan, status: 'Offline' }])).toContain('"\'=SUM(1,2)"');
  });
});
