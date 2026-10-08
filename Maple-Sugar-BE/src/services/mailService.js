/**
 * Outbound email through Brevo's transactional API.
 *
 * One HTTPS call per message, no SMTP connection to keep alive. Mail is off
 * until BREVO_API_KEY and MAIL_FROM are both set, so a laptop checkout never
 * emails the crew; callers can send unconditionally and let this decide.
 */

import { config } from '../config.js';
import { logger } from '../lib/logger.js';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const TIMEOUT_MS = 10_000;

export function isMailEnabled() {
  return Boolean(config.brevo.apiKey && config.brevo.sender);
}

/** Accepts 'a@b.c', { email, name }, or a user row with Email/First_Name. */
function toRecipient(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return { email: entry.trim() };
  if (entry.email) return { email: entry.email.trim(), name: entry.name || undefined };
  if (entry.Email) {
    const name = `${entry.First_Name ?? ''} ${entry.Last_Name ?? ''}`.trim();
    return { email: entry.Email.trim(), name: name || undefined };
  }
  return null;
}

/** Case-insensitive, so ALERT_EMAILS and an opted-in admin are not mailed twice. */
export function uniqueRecipients(entries) {
  const seen = new Map();
  for (const entry of entries) {
    const recipient = toRecipient(entry);
    if (!recipient?.email) continue;
    const key = recipient.email.toLowerCase();
    if (!seen.has(key)) seen.set(key, recipient);
  }
  return [...seen.values()];
}

/**
 * Sends one copy per recipient. Brevo's messageVersions keeps it to a single
 * API call without putting every address in a shared To line.
 *
 * Resolves to { sent } and throws on a Brevo error. Callers on a request path
 * should go through sendQuietly instead.
 */
export async function sendEmail({ to, subject, html, text, tags = [] }) {
  const recipients = uniqueRecipients(Array.isArray(to) ? to : [to]);
  if (!recipients.length) return { sent: 0 };

  if (!isMailEnabled()) {
    logger.debug({ subject, recipients: recipients.length }, 'Mail is off; email not sent');
    return { sent: 0, disabled: true };
  }

  const response = await fetch(BREVO_SEND_URL, {
    method: 'POST',
    headers: {
      'api-key': config.brevo.apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: config.brevo.sender, name: config.brevo.senderName },
      subject,
      htmlContent: html,
      textContent: text,
      tags,
      messageVersions: recipients.map((recipient) => ({ to: [recipient] })),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const error = new Error(`Brevo send failed (${response.status}): ${detail.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }

  logger.info({ subject, sent: recipients.length, tags }, 'Email sent');
  return { sent: recipients.length };
}

/** Never throws: a mail outage must not fail the signup or alert behind it. */
export async function sendQuietly(message) {
  try {
    return await sendEmail(message);
  } catch (error) {
    logger.error({ err: error, subject: message.subject }, 'Email failed');
    return { sent: 0, error };
  }
}
