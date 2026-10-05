/**
 * Subject, HTML, and plain-text bodies for every email the API sends.
 *
 * Each builder returns { subject, html, text }. HTML is table-free and inline
 * styled because mail clients strip <style>; the text part is what screen
 * readers and plain-text clients get, so it carries the same facts.
 */

import { config } from '../config.js';
import { SUGARBUSH_TIME_ZONE } from '../business/availability.js';

const BRAND = '#F76902';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function link(path) {
  return `${config.publicWebUrl}${path}`;
}

/** "Mon, Oct 6, 9:00 AM – 11:00 AM EDT", always in sugarbush time. */
export function formatShiftWindow(startsAt, endsAt) {
  if (!startsAt) return 'Time not picked yet';
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: SUGARBUSH_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(startsAt));
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: SUGARBUSH_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
  const zone = new Intl.DateTimeFormat('en-US', {
    timeZone: SUGARBUSH_TIME_ZONE,
    timeZoneName: 'short',
  })
    .formatToParts(new Date(startsAt))
    .find((part) => part.type === 'timeZoneName')?.value;
  const start = time.format(new Date(startsAt));
  const end = endsAt ? ` – ${time.format(new Date(endsAt))}` : '';
  return `${day}, ${start}${end}${zone ? ` ${zone}` : ''}`;
}

function layout({ heading, paragraphs, details = [], action }) {
  const rows = details
    .map(
      ([label, value]) =>
        `<p style="margin:0 0 6px"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`,
    )
    .join('');
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px">${escapeHtml(p)}</p>`).join('');
  const button = action
    ? `<p style="margin:20px 0 0"><a href="${escapeHtml(action.href)}" style="background:${BRAND};color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-weight:600">${escapeHtml(action.label)}</a></p>`
    : '';

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#222">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
<div style="background:${BRAND};color:#fff;padding:14px 24px;font-weight:700">RIT Maple Sugaring</div>
<div style="padding:24px;font-size:15px;line-height:1.5">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(heading)}</h1>
${body}${rows ? `<div style="background:#faf6f2;border-radius:6px;padding:12px 16px">${rows}</div>` : ''}${button}
</div>
<div style="padding:12px 24px;font-size:12px;color:#777;border-top:1px solid #eee">You can change which emails you get from the notifications menu in the Maple Sugaring app.</div>
</div></body></html>`;

  const text = [
    heading,
    '',
    ...paragraphs.flatMap((p) => [p, '']),
    ...details.map(([label, value]) => `${label}: ${value}`),
    ...(action ? ['', `${action.label}: ${action.href}`] : []),
  ].join('\n');

  return { html, text };
}

function shiftDetails(slot) {
  const details = [
    ['Task', slot.Task],
    ['Where', slot.Stand],
    ['When', formatShiftWindow(slot.Starts_At, slot.Ends_At)],
  ];
  if (slot.Bucket_Labels?.length) details.push(['Buckets', slot.Bucket_Labels.join(', ')]);
  if (slot.Notes) details.push(['Notes', slot.Notes]);
  return details;
}

const scheduleAction = { label: 'Open the schedule', get href() { return link('/schedule'); } };

export function criticalAlertEmail(alert) {
  const where = alert.Node_Name ?? (alert.NodeID == null ? 'the sugarbush' : `node ${alert.NodeID}`);
  const subject = `Maple Sugaring alert: ${alert.Alert_Type} at ${where}`;
  const details = [
    ['Alert', alert.Alert_Type],
    ['Where', where],
    ['Severity', alert.severity ?? alert.Severity ?? 'critical'],
  ];
  if (alert.Created_At) details.push(['Raised', formatShiftWindow(alert.Created_At)]);
  return {
    subject,
    ...layout({
      heading: `${alert.Alert_Type} at ${where}`,
      paragraphs: [alert.Description || 'A sensor raised a critical alert.', 'Someone should check on it soon.'],
      details,
      action: { label: 'View alerts', href: link('/notifications') },
    }),
  };
}

/** Covers a self signup (confirmation) and an admin assigning someone. */
export function shiftAssignedEmail(slot, { byAdmin = false } = {}) {
  return {
    subject: `${byAdmin ? 'You were assigned' : 'You signed up for'}: ${slot.Task}, ${formatShiftWindow(slot.Starts_At, slot.Ends_At)}`,
    ...layout({
      heading: byAdmin ? 'You have a new shift' : 'You are signed up',
      paragraphs: [
        byAdmin
          ? 'An administrator put you on this shift.'
          : 'Thanks for signing up. Here are the details.',
        `We will send a reminder about ${config.shiftReminderHours} hours before it starts.`,
      ],
      details: shiftDetails(slot),
      action: scheduleAction,
    }),
  };
}

export function shiftRemovedEmail(slot, { byAdmin = false } = {}) {
  return {
    subject: `Removed from shift: ${slot.Task}, ${formatShiftWindow(slot.Starts_At, slot.Ends_At)}`,
    ...layout({
      heading: 'You are off this shift',
      paragraphs: [
        byAdmin
          ? 'An administrator took you off this shift. You do not need to go.'
          : 'You withdrew from this shift. You do not need to go.',
      ],
      details: shiftDetails(slot),
      action: scheduleAction,
    }),
  };
}

export function shiftChangedEmail(slot) {
  return {
    subject: `Shift changed: ${slot.Task}, now ${formatShiftWindow(slot.Starts_At, slot.Ends_At)}`,
    ...layout({
      heading: 'Your shift changed',
      paragraphs: ['An administrator updated a shift you are on. These are the new details.'],
      details: shiftDetails(slot),
      action: scheduleAction,
    }),
  };
}

export function shiftCancelledEmail(slot) {
  return {
    subject: `Shift cancelled: ${slot.Task}, ${formatShiftWindow(slot.Starts_At, slot.Ends_At)}`,
    ...layout({
      heading: 'Your shift was cancelled',
      paragraphs: ['An administrator removed this shift from the schedule. You do not need to go.'],
      details: shiftDetails(slot),
      action: scheduleAction,
    }),
  };
}

export function shiftReminderEmail(slot) {
  return {
    subject: `Reminder: ${slot.Task}, ${formatShiftWindow(slot.Starts_At, slot.Ends_At)}`,
    ...layout({
      heading: 'Shift coming up',
      paragraphs: ['This is a reminder about your upcoming shift. Dress for the weather.'],
      details: shiftDetails(slot),
      action: scheduleAction,
    }),
  };
}

export function inviteEmail({ roleLabel, inviterName }) {
  const by = inviterName ? `${inviterName} invited you` : 'You have been invited';
  return {
    subject: 'You are invited to RIT Maple Sugaring',
    ...layout({
      heading: 'Welcome to RIT Maple Sugaring',
      paragraphs: [
        `${by} to the RIT Maple Sugaring monitoring app as ${roleLabel}.`,
        'Sign in with this RIT Google account to finish setting up. There is no password to create.',
      ],
      action: { label: 'Sign in', href: link('/login') },
    }),
  };
}

export function testEmail() {
  return {
    subject: 'Maple Sugaring test email',
    ...layout({
      heading: 'Email is working',
      paragraphs: ['Brevo delivered this test message from the Maple Sugaring API.'],
      action: { label: 'Open the app', href: link('/dashboard') },
    }),
  };
}
