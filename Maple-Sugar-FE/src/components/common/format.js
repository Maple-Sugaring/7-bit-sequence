import dayjs from 'dayjs';

/** Display formatting shared across pages so units never drift between views. */

export function percent(value, places = 1) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(places)}%`;
}

export function pounds(value, places = 1) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(places)} lb`;
}

export function gallons(value, places = 2) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(places)} gal`;
}

export function fahrenheit(value, places = 1) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(places)}\u00B0F`;
}

export function decibels(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Math.round(value)} dBm`;
}

export function ratio(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(0)}:1`;
}

export function dateTime(value) {
  if (!value) return '—';
  return dayjs(value).format('MMM D, YYYY h:mm A');
}

export function dateOnly(value) {
  if (!value) return '—';
  return dayjs(value).format('MMM D, YYYY');
}

export function timeOnly(value) {
  if (!value) return '—';
  return dayjs(value).format('h:mm A');
}

export function relativeMinutes(minutes) {
  if (minutes == null) return '—';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hr ago`;
  return `${Math.round(minutes / 1440)} d ago`;
}

export function signedPercent(value, places = 1) {
  if (value == null || Number.isNaN(value)) return null;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(places)}%`;
}
