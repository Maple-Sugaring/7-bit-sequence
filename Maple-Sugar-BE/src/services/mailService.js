/**
 * Outbound email through the Gmail API or Brevo's transactional API.
 *
 * Gmail wins when GMAIL_REFRESH_TOKEN is set: it sends as the MAIL_FROM Gmail
 * account, and Google signs that mail, so receivers trust it. Brevo cannot sign
 * for gmail.com and needs a sender on a domain we authenticate there.
 *
 * Mail is off until MAIL_FROM and one transport are set, so a laptop checkout
 * never emails the crew; callers can send unconditionally and let this decide.
 */

import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const TIMEOUT_MS = 10_000;
// Refresh a minute early so a token never expires mid-batch.
const TOKEN_SLACK_MS = 60_000;

/** Only builds MIME; nothing is sent through it. */
const mimeBuilder = nodemailer.createTransport({ streamTransport: true, buffer: true });

let cachedToken = null;

function useGmail() {
  return Boolean(config.gmail.refreshToken);
}

export function isMailEnabled() {
  return Boolean(config.brevo.sender && (useGmail() || config.brevo.apiKey));
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

async function failure(service, response) {
  const detail = await response.text().catch(() => '');
  const error = new Error(`${service} send failed (${response.status}): ${detail.slice(0, 300)}`);
  error.status = response.status;
  return error;
}

/** Cached per refresh token, so a new token in config is picked up at once. */
async function gmailAccessToken() {
  const { refreshToken } = config.gmail;
  if (cachedToken?.refreshToken === refreshToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw await failure('Gmail token', response);

  const { access_token: accessToken, expires_in: expiresIn } = await response.json();
  cachedToken = { refreshToken, accessToken, expiresAt: Date.now() + expiresIn * 1000 - TOKEN_SLACK_MS };
  return accessToken;
}

/** One API call per recipient: Gmail has no equivalent of messageVersions. */
async function sendWithGmail(recipients, { subject, html, text, onRecipientSent }) {
  const accessToken = await gmailAccessToken();
  for (const recipient of recipients) {
    const { message } = await mimeBuilder.sendMail({
      from: { address: config.brevo.sender, name: config.brevo.senderName },
      to: recipient.name ? { address: recipient.email, name: recipient.name } : recipient.email,
      subject,
      html,
      text,
    });
    const response = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ raw: message.toString('base64url') }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw await failure('Gmail', response);
    await onRecipientSent?.(recipient.email);
  }
}

/** Brevo's messageVersions keeps it to one call without a shared To line. */
async function sendWithBrevo(recipients, { subject, html, text, tags, onRecipientSent }) {
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
  if (!response.ok) throw await failure('Brevo', response);
  for (const recipient of recipients) await onRecipientSent?.(recipient.email);
}

/**
 * Sends one copy per recipient.
 *
 * Resolves to { sent } and throws on a transport error. Callers on a request
 * path should go through sendQuietly instead.
 */
export async function sendEmail({ to, subject, html, text, tags = [], onRecipientSent }) {
  const recipients = uniqueRecipients(Array.isArray(to) ? to : [to]);
  if (!recipients.length) return { sent: 0 };

  if (!isMailEnabled()) {
    logger.debug({ subject, recipients: recipients.length }, 'Mail is off; email not sent');
    return { sent: 0, disabled: true };
  }

  const message = { subject, html, text, tags, onRecipientSent };
  if (useGmail()) await sendWithGmail(recipients, message);
  else await sendWithBrevo(recipients, message);

  logger.info({ subject, sent: recipients.length, tags, via: useGmail() ? 'gmail' : 'brevo' }, 'Email sent');
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
