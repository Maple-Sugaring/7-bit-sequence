import dayjs from 'dayjs';

export const SENSOR_KIT = 'Generic 5–10 kg C3 four-point load-cell kit';

export function healthReading(value, unit, reportedAt, intervalSeconds, warning, now = Date.now()) {
  if (value == null) return 'Unknown';
  const label = `${value}${unit}`;
  if (!reportedAt) return `${label} (${warning ? warning + ', ' : ''}freshness unknown)`;
  const stale = now - new Date(reportedAt).getTime() >= 2000 * (intervalSeconds ?? 900);
  const states = [warning, stale && 'stale'].filter(Boolean);
  return states.length ? `${label} (${states.join(', ')})` : label;
}

export function lifecycleRow(node, { kitCost, serviceYears }, today) {
  const installations = node.History.filter((event) => event.type !== 'maintenance' && event.date <= today);
  const installed = installations.find((event) => !event.assumed) ?? installations[0];
  const matchesKit = installed?.sensorType === SENSOR_KIT;
  const due = matchesKit && Number.isInteger(serviceYears) && serviceYears > 0 && serviceYears <= 100
    ? dayjs(installed.date).add(serviceYears, 'year').format('YYYY-MM-DD')
    : null;
  const battery = healthReading(node.Battery, '%', node.BatteryReportedAt, node.ReportInterval,
    node.Battery != null && Number(node.Battery) < 20 && 'low battery');
  const signal = healthReading(node.Signal, ' dBm', node.SignalReportedAt, node.ReportInterval,
    node.Signal != null && Number(node.Signal) < -110 && 'weak signal');
  return {
    installed,
    ageDays: installed ? dayjs(today).diff(dayjs(installed.date), 'day') : null,
    due,
    cost: matchesKit && Number.isFinite(kitCost) && kitCost >= 0 ? kitCost + 4.95 : null,
    battery,
    signal,
  };
}

export function lifecycleCsv(rows) {
  const header = ['Node', 'Battery', 'Signal', 'Last seen', 'Status', 'Fault', 'Sensor', 'Installed',
    'Assumed installation', 'Age (days)', 'Replacement due', 'Replacement cost (USD)'];
  const records = rows.map(({ node, plan, status }) => [
    node.Name, plan.battery, plan.signal, node.LastSeen, status, node.Fault, plan.installed?.sensorType,
    plan.installed?.date, plan.installed?.assumed, plan.ageDays, plan.due, plan.cost?.toFixed(2),
  ]);
  return [header, ...records].map((row) => row.map((value) => {
    const text = String(value ?? '');
    const safe = typeof value === 'string' && /^[\s]*[=+@\-\t\r\n]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n');
}
