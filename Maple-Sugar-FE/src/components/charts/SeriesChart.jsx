import dayjs from 'dayjs';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { useTheme } from '@mui/material/styles';

/**
 * Wrappers over MUI X charts that take the `{ date, value }` points the
 * aggregation layer produces, so pages never reshape data for a chart.
 */

export function DailyLineChart({ points, label, unit, color = 'primary', area = false }) {
  const theme = useTheme();
  const stroke = theme.palette[color]?.main ?? theme.palette.primary.main;

  return (
    <LineChart
      height={undefined}
      xAxis={[
        {
          data: points.map((point) => new Date(point.date)),
          scaleType: 'time',
          valueFormatter: (value) => dayjs(value).format('MMM D'),
        },
      ]}
      yAxis={[{ label: unit, width: 60 }]}
      series={[
        {
          data: points.map((point) => point.value),
          label,
          color: stroke,
          area,
          showMark: points.length <= 30,
          valueFormatter: (value) => (value == null ? 'No reading' : `${value.toFixed(2)}${unit ? ` ${unit}` : ''}`),
        },
      ]}
      margin={{ left: 8, right: 16, top: 16, bottom: 8 }}
      grid={{ horizontal: true }}
    />
  );
}

export function DailyBarChart({ points, label, unit, color = 'secondary' }) {
  const theme = useTheme();

  return (
    <BarChart
      xAxis={[
        {
          data: points.map((point) => dayjs(point.date).format('MMM D')),
          scaleType: 'band',
        },
      ]}
      yAxis={[{ label: unit, width: 60 }]}
      series={[
        {
          data: points.map((point) => point.value),
          label,
          color: theme.palette[color]?.main ?? theme.palette.secondary.main,
          valueFormatter: (value) => (value == null ? '—' : `${value.toFixed(2)}${unit ? ` ${unit}` : ''}`),
        },
      ]}
      margin={{ left: 8, right: 16, top: 16, bottom: 8 }}
      grid={{ horizontal: true }}
    />
  );
}

/**
 * Year-over-year comparison (FR-013). The x-axis is days into the season
 * rather than calendar dates, so seasons that started on different dates can
 * be read against each other.
 */
export function SeasonComparisonChart({ rows, seasons, label, unit }) {
  const theme = useTheme();
  const palette = [
    theme.palette.primary.main,
    theme.palette.info.main,
    theme.palette.success.main,
    theme.palette.secondary.main,
  ];

  return (
    <LineChart
      dataset={rows}
      xAxis={[
        {
          dataKey: 'dayOfSeason',
          label: 'Day of season',
          valueFormatter: (value) => `Day ${value}`,
        },
      ]}
      yAxis={[{ label: unit, width: 60 }]}
      series={seasons.map((season, index) => ({
        dataKey: String(season),
        label: `${season} season`,
        color: palette[index % palette.length],
        showMark: false,
        connectNulls: true,
        valueFormatter: (value) =>
          value == null ? 'No reading' : `${value.toFixed(2)}${unit ? ` ${unit}` : ''}`,
      }))}
      margin={{ left: 8, right: 16, top: 16, bottom: 8 }}
      grid={{ horizontal: true }}
      slotProps={{ legend: { direction: 'horizontal', position: { vertical: 'bottom', horizontal: 'center' } } }}
      aria-label={`${label} compared across seasons`}
    />
  );
}
