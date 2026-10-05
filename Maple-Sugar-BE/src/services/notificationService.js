/**
 * Outbound critical alerts.
 *
 * In-app notifications already exist. Email and SMS fire only when the matching
 * environment variables are set, so a laptop checkout never texts the crew.
 */

import { config } from '../config.js';
import { logger } from '../lib/logger.js';

/** Full buckets are warnings in the UI, but they are the spillage alarm. */
const ALWAYS_NOTIFY = new Set(['Full Bucket', 'Node Offline', 'Spoilage', 'Tipped']);

export function shouldNotify(alert) {
  if (!alert) return false;
  return alert.severity === 'critical' || ALWAYS_NOTIFY.has(alert.Alert_Type);
}

function messageFor(alert) {
  const where = alert.NodeID == null ? 'the sugarbush' : `node ${alert.NodeID}`;
  return `Maple Sugaring ${alert.Alert_Type} at ${where}. ${alert.Description ?? ''}`.trim();
}

async function sendEmail(alert) {
  if (!config.smtpUrl || !config.alertEmails.length) return;

  let nodemailer;
  try {
    nodemailer = await import('nodemailer');
  } catch (error) {
    logger.error({ err: error }, 'nodemailer is not installed; critical email was not sent');
    return;
  }

  const transport = nodemailer.createTransport(config.smtpUrl);
  await transport.sendMail({
    from: config.alertFrom || config.alertEmails[0],
    to: config.alertEmails.join(', '),
    subject: `Maple Sugaring: ${alert.Alert_Type}`,
    text: messageFor(alert),
  });
}

async function sendSms(alert) {
  const { accountSid, authToken, from } = config.twilio;
  if (!accountSid || !authToken || !from || !config.alertSmsTo.length) return;

  const token = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  await Promise.all(
    config.alertSmsTo.map(async (to) => {
      const body = new URLSearchParams({ To: to, From: from, Body: messageFor(alert) });
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        },
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Twilio SMS failed (${response.status}): ${detail.slice(0, 200)}`);
      }
    }),
  );
}

/** Never throws into the request that created the alert. */
export async function notifyCriticalAlert(alert) {
  if (!shouldNotify(alert)) return;

  const results = await Promise.allSettled([sendEmail(alert), sendSms(alert)]);
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error({ err: result.reason, alertType: alert.Alert_Type }, 'Critical notification failed');
    }
  }
}
