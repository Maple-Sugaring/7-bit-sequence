/**
 * Shapes the collection log for reading: entries grouped by the day they were
 * collected, with each day's total, and the log's quality note cleaned up.
 */

const TEST_SAMPLE_MARKER = /^\s*\[Test sample\]\s*/i;

/** Volumes arrive as numbers or numeric strings; null stays null. */
export function volumeOf(log) {
  if (log?.Volume_Collected == null || log.Volume_Collected === '') return null;
  const volume = Number(log.Volume_Collected);
  return Number.isFinite(volume) ? volume : null;
}

/** "2.58", "0.3", "3.6": two places at most, no trailing zeros. */
export function formatGallons(volume) {
  return String(Number(volume.toFixed(2)));
}

/** The note without the "[Test sample]" marker, which the Test tag already says. */
export function displayNote(log) {
  return (log?.Quality_Notes ?? '').replace(TEST_SAMPLE_MARKER, '').trim();
}

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** "Today", "Yesterday", then "Sun, Nov 15" (with the year once it is not this one). */
export function dayLabel(date, now = new Date()) {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(now)) return 'Today';
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/**
 * Groups logs (newest first, as the API sends them) by calendar day, keeping
 * their order. `largest` is the biggest single collection, for scaling bars.
 */
export function groupLogsByDay(logs, now = new Date()) {
  const days = [];
  let largest = 0;

  for (const log of logs ?? []) {
    const collected = new Date(log.Collected_At);
    const key = dayKey(collected);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = { key, label: dayLabel(collected, now), logs: [], totalGallons: 0 };
      days.push(day);
    }
    const volume = volumeOf(log);
    if (volume != null) {
      day.totalGallons += volume;
      largest = Math.max(largest, volume);
    }
    day.logs.push(log);
  }

  return { days, largest };
}
