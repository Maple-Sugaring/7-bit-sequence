import { query, queryOne } from '../db/pool.js';

export async function getReportIntervalSeconds() {
  const row = await queryOne(
    `select value from app_settings where key = 'report_interval_seconds'`,
  );
  const parsed = Number(row?.value ?? 900);
  return Number.isFinite(parsed) ? parsed : 900;
}

export async function setReportIntervalMinutes(minutes) {
  const seconds = minutes * 60;
  await query(
    `insert into app_settings (key, value, updated_at)
     values ('report_interval_seconds', $1, CURRENT_TIMESTAMP)
     on conflict (key) do update
       set value = excluded.value,
           updated_at = CURRENT_TIMESTAMP`,
    [String(seconds)],
  );
  await query('update node set report_interval_seconds = $1', [seconds]);
  return seconds;
}
