import { ritOrange } from '../../theme/ritColors';

/**
 * One color per tree (or per year) on the multi-line charts, in order.
 * Kept out of SeriesChart.jsx, which may only export components for fast refresh.
 */
export const TREE_COLORS = [
  ritOrange,
  'var(--chart-blue)',
  'var(--chart-green)',
  'var(--chart-contrast)',
  'var(--chart-purple)',
  'var(--chart-red)',
  'var(--chart-orange)',
  'var(--chart-gray)',
];
