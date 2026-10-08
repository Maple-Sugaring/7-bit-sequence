import dayjs from 'dayjs';

/** Weeks run Sunday to Saturday, in the viewer's local time. */

export function weekStart(date) {
  return dayjs(date).startOf('week').format('YYYY-MM-DD');
}

export function weekDays(start) {
  return Array.from({ length: 7 }, (_, offset) => dayjs(start).add(offset, 'day').format('YYYY-MM-DD'));
}

export function weekLabel(start) {
  const first = dayjs(start);
  return `${first.format('MMM D')} – ${first.add(6, 'day').format('MMM D')}`;
}

export function entriesInWeek(entries, start) {
  const from = dayjs(start).startOf('day');
  const to = from.add(7, 'day');
  return entries.filter((entry) => {
    const at = dayjs(entry.Collected_At);
    return !at.isBefore(from) && at.isBefore(to);
  });
}

/** The seven days of the week containing `today`, with forecast values where we have them. */
export function weekForecastRows(forecast, today = dayjs()) {
  const byDate = new Map((forecast ?? []).map((row) => [row.Date, row]));
  return weekDays(weekStart(today)).map((date) => ({ ...byDate.get(date), Date: date }));
}
