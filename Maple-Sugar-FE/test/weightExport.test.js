import { describe, expect, test } from 'vitest';

import { buildPdf, exportRows, toCsv, totals } from '../src/business/weightExport';

const readings = [
  { NodeID: 2, nodeName: 'Árbol "Grande", ñandú', stand: 'Alumni', Weight: 11, Sugar_Percent: 2, Recorded_At: '2026-09-25T18:05:00.000Z' },
  { NodeID: 1, nodeName: 'Tree 1', stand: 'Alumni', Weight: 9.5, Sugar_Percent: null, Recorded_At: '2026-09-25T12:00:00.000Z' },
  { NodeID: 1, nodeName: 'Tree 1', stand: 'Alumni', Weight: 1, Recorded_At: '2026-09-30T12:00:00.000Z' },
];

describe('weight export', () => {
  test('filters by period, sorts, and keeps full timestamps', () => {
    const rows = exportRows(readings, '2026-09-25', '2026-09-26');
    expect(rows.map((r) => r.timestamp)).toEqual(['2026-09-25 12:00:00', '2026-09-25 18:05:00']);
  });

  test('CSV escapes quotes and commas and matches the rows', () => {
    const rows = exportRows(readings, null, null);
    const lines = toCsv(rows).split('\r\n');
    expect(lines[0]).toBe('timestamp_utc,node,tree,stand,weight_lb,sugar_percent');
    expect(lines).toHaveLength(rows.length + 1);
    expect(lines[2]).toContain('"Árbol ""Grande"", ñandú"');
  });

  test('totals ignore missing weights', () => {
    expect(totals(exportRows(readings, null, null))).toEqual({ count: 3, nodes: 2, averageWeight: (9.5 + 11 + 1) / 3 });
    expect(totals([]).averageWeight).toBeNull();
  });

  test('PDF paginates large exports and handles empty data', async () => {
    const many = Array.from({ length: 300 }, (_, i) => ({
      NodeID: 1, nodeName: 'x'.repeat(80), stand: 'S', Weight: i, Recorded_At: `2026-09-25T00:${String(i % 60).padStart(2, '0')}:00.000Z`,
    }));
    const big = await buildPdf(exportRows(many, null, null), { from: null, to: null });
    expect(big.getNumberOfPages()).toBeGreaterThan(3);
    const empty = await buildPdf([], { from: '2026-01-01', to: '2026-01-02' });
    expect(empty.getNumberOfPages()).toBe(1);
  });
});
