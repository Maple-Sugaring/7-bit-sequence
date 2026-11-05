// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('recharts', async (importOriginal) => {
  const original = await importOriginal();
  const { cloneElement } = await import('react');
  return {
    ...original,
    // jsdom has no measured layout. Keep real chart accessibility behavior.
    ResponsiveContainer: ({ children }) => cloneElement(children, { width: 600, height: 280 }),
  };
});

import { WeightChart, WeightFigure } from '../src/components/charts/SeriesChart';

const rows = [{ Date: '2026-03-01', tree: 2.5, 'tree-lb': 21.5 }];
const series = [{ key: 'tree', name: 'Tree 1' }];
afterEach(cleanup);

describe('chart alternatives', () => {
  it('paints keyboard tooltips with the same adaptive surface as their text', async () => {
    const { container } = render(<WeightChart rows={rows} series={series} />);
    fireEvent.keyDown(screen.getByRole('application'), { key: 'ArrowRight' });
    await waitFor(() => expect(container.querySelector('.recharts-default-tooltip')).toBeTruthy());
    const tooltip = container.querySelector('.recharts-default-tooltip');
    expect(tooltip.style.backgroundColor).toBe('var(--surface)');
    expect(tooltip.querySelector('.recharts-tooltip-label').style.color).toBe('var(--chart-text)');
    expect(tooltip.querySelector('.recharts-tooltip-item').style.color).toBe('var(--chart-text)');
  });

  it('keeps the standalone weight chart keyboard focusable', () => {
    render(<WeightChart rows={rows} series={series} />);
    expect(screen.getByRole('application').getAttribute('tabindex')).toBe('0');
  });

  it('provides the table alternative when a figure disables the keyboard layer', () => {
    render(<WeightFigure rows={rows} series={series} />);
    expect(screen.queryByRole('application')).toBeNull();
    expect(screen.getByRole('img', { name: /Sap in each bucket over time/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'View as table' }));
    expect(screen.getByRole('columnheader', { name: 'Tree 1 (gal)' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '2.5 (21.5 lb)' })).toBeTruthy();
  });
});
