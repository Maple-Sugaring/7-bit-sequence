/**
 * Open collection windows on a volunteer's calendar.
 *
 * Times are built in America/New_York because that is the sugarbush, not the
 * clock of whatever machine happens to run the API.
 */

export const SUGARBUSH_TIME_ZONE = 'America/New_York';

const BLOCK_HOURS = [8, 10, 12, 14, 16];
const BLOCK_LENGTH_HOURS = 2;

function pad(value) {
  return String(value).padStart(2, '0');
}

/** UTC instant for a wall-clock time in the sugarbush zone. */
export function zonedTimeToUtc(date, hour, minute = 0, timeZone = SUGARBUSH_TIME_ZONE) {
  const asUtc = new Date(`${date}T${pad(hour)}:${pad(minute)}:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(asUtc);

  const read = (type) => Number(parts.find((part) => part.type === type)?.value);
  const wallAsUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour'),
    read('minute'),
    read('second'),
  );
  const offset = wallAsUtc - asUtc.getTime();
  return new Date(asUtc.getTime() - offset);
}

export function formatZoneDate(instant, timeZone = SUGARBUSH_TIME_ZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function addDays(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function labelFor(start, end, timeZone) {
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(start);
  const clock = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${day} · ${clock.format(start)} – ${clock.format(end)}`;
}

/**
 * Two-hour daylight blocks over the next week that do not intersect busy
 * ranges from Google Calendar. `busy` items are `{ start, end }` ISO strings.
 */
export function suggestCollectionWindows({
  now = new Date(),
  busy = [],
  days = 7,
  limit = 12,
  timeZone = SUGARBUSH_TIME_ZONE,
} = {}) {
  const busyRanges = busy
    .map((item) => ({
      start: new Date(item.start ?? item.Start),
      end: new Date(item.end ?? item.End),
    }))
    .filter((item) => !Number.isNaN(item.start.getTime()) && !Number.isNaN(item.end.getTime()));

  const windows = [];
  const today = formatZoneDate(now, timeZone);

  for (let offset = 0; offset < days && windows.length < limit; offset += 1) {
    const date = addDays(today, offset);
    for (const hour of BLOCK_HOURS) {
      if (windows.length >= limit) break;
      const start = zonedTimeToUtc(date, hour, 0, timeZone);
      const end = zonedTimeToUtc(date, hour + BLOCK_LENGTH_HOURS, 0, timeZone);
      if (end <= now) continue;
      if (start.getTime() - now.getTime() < 30 * 60 * 1000) continue;
      const blocked = busyRanges.some((range) => overlaps(start, end, range.start, range.end));
      if (blocked) continue;
      windows.push({
        Starts_At: start.toISOString(),
        Ends_At: end.toISOString(),
        Label: labelFor(start, end, timeZone),
      });
    }
  }

  return windows;
}

/** A student-picked window. Suggestions are optional; this only rejects conflicts. */
export function validateChosenWindow({ startsAt, endsAt, busy = [], now = new Date() }) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Pick a valid start and end.';
  }
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  if (hours < 0.5 || hours > 6) {
    return 'A shift should last between 30 minutes and 6 hours.';
  }
  if (start.getTime() < now.getTime() - 60_000) return 'Pick a time that has not already passed.';
  if (start.getTime() > now.getTime() + 21 * 86_400_000) {
    return 'Pick a time within the next three weeks.';
  }
  const blocked = busy.some((item) => {
    const busyStart = new Date(item.start ?? item.Start);
    const busyEnd = new Date(item.end ?? item.End);
    return start < busyEnd && end > busyStart;
  });
  if (blocked) return 'That overlaps something already on your calendar.';
  return null;
}
