/**
 * Outbound critical alerts.
 *
 * In-app notifications already exist. Each channel fires only when its own
 * settings are present, so a laptop checkout never mails or texts the crew:
 *
 * - Email through Brevo's free tier to opted-in users plus ALERT_EMAILS, once
 *   BREVO_API_KEY and MAIL_FROM are set.
 * - Email through SMTP_URL to ALERT_EMAILS, only while Brevo is off. This keeps
 *   a deployment that predates Brevo alerting after upgrading.
 * - SMS through Twilio to ALERT_SMS_TO (FR-006), independent of email.
 *
 * An alert still unresolved after ALERT_ESCALATION_MINUTES goes out again to
 * every active admin (FR-025).
 */

import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import * as alertsRepository from '../repositories/alertsRepository.js';
import * as nodesRepository from '../repositories/nodesRepository.js';
import * as usersRepository from '../repositories/usersRepository.js';
import { criticalAlertEmail } from './emailTemplates.js';
import { isMailEnabled, sendEmail } from './mailService.js';

/** Full buckets are warnings in the UI, but they are the spillage alarm. */
const ALWAYS_NOTIFY = new Set(['Full Bucket', 'Node Offline', 'Spoilage', 'Tipped']);

export function shouldNotify(alert) {
  if (!alert) return false;
  return alert.severity === 'critical' || ALWAYS_NOTIFY.has(alert.Alert_Type);
}

/** "Alumni 1" reads better than "node 3" in a subject line. */
async function withNodeName(alert) {
  if (alert.NodeID == null || alert.Node_Name) return alert;
  try {
    const node = await nodesRepository.findNodeById(alert.NodeID);
    return node?.Node_Name ? { ...alert, Node_Name: node.Node_Name } : alert;
  } catch {
    return alert;
  }
}

function messageFor(alert, { escalatedAfterMinutes = null } = {}) {
  const where = alert.Node_Name ?? (alert.NodeID == null ? 'the sugarbush' : `node ${alert.NodeID}`);
  const prefix = escalatedAfterMinutes == null ? '' : `ESCALATED, unresolved ${escalatedAfterMinutes} min: `;
  return `${prefix}Maple Sugaring ${alert.Alert_Type} at ${where}. ${alert.Description ?? ''}`.trim();
}

async function sendBrevoEmail(alert, recipients, options) {
  await sendEmail({
    to: [...recipients, ...config.alertEmails],
    ...criticalAlertEmail(alert, options),
    tags: ['alert', alert.Alert_Type, ...(options.escalatedAfterMinutes == null ? [] : ['escalated'])],
  });
}

/** The pre-Brevo path: one relay, one fixed recipient list. */
async function sendSmtpEmail(alert, options) {
  if (!config.smtpUrl || !config.alertEmails.length) return;

  let nodemailer;
  try {
    nodemailer = await import('nodemailer');
  } catch (error) {
    logger.error({ err: error }, 'nodemailer is not installed; critical email was not sent');
    return;
  }

  const { subject, text, html } = criticalAlertEmail(alert, options);
  await nodemailer.createTransport(config.smtpUrl).sendMail({
    from: config.alertFrom || config.alertEmails[0],
    to: config.alertEmails.join(', '),
    subject,
    text,
    html,
  });
}

async function sendSms(alert, options) {
  const { accountSid, authToken, from } = config.twilio;
  if (!accountSid || !authToken || !from || !config.alertSmsTo.length) return;

  const token = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  await Promise.all(
    config.alertSmsTo.map(async (to) => {
      const body = new URLSearchParams({ To: to, From: from, Body: messageFor(alert, options) });
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Twilio SMS failed (${response.status}): ${detail.slice(0, 200)}`);
      }
    }),
  );
}

/**
 * Runs every configured channel and reports whether all of them succeeded.
 * Channels are independent: a Twilio outage must not stop the email.
 */
async function deliver(alert, recipients, options = {}) {
  const results = await Promise.allSettled([
    isMailEnabled() ? sendBrevoEmail(alert, recipients, options) : sendSmtpEmail(alert, options),
    sendSms(alert, options),
  ]);

  let ok = true;
  for (const result of results) {
    if (result.status === 'rejected') {
      ok = false;
      logger.error({ err: result.reason, alertType: alert.Alert_Type }, 'Critical notification failed');
    }
  }
  return ok;
}

/** Never throws into the request that created the alert. */
export async function notifyCriticalAlert(alert) {
  if (!shouldNotify(alert)) return;

  try {
    const recipients = isMailEnabled() ? await usersRepository.listAlertRecipients() : [];
    await deliver(await withNodeName(alert), recipients);
  } catch (error) {
    logger.error({ err: error, alertType: alert.Alert_Type }, 'Critical notification failed');
  }
}

/**
 * Re-sends alerts nobody resolved within ALERT_ESCALATION_MINUTES to every
 * active admin plus the usual recipients. Called by housekeeping. An alert
 * whose send failed is released so the next pass retries it.
 */
export async function escalateStaleAlerts() {
  const minutes = config.alertEscalationMinutes;
  if (!(minutes > 0)) return 0;

  const stale = await alertsRepository.claimAlertsForEscalation(minutes, [...ALWAYS_NOTIFY]);
  let escalated = 0;

  for (const claimed of stale) {
    try {
      const recipients = isMailEnabled()
        ? [
            ...(await usersRepository.listAlertRecipients()),
            ...(await usersRepository.listActiveAdmins()),
          ]
        : [];
      const alert = await withNodeName(claimed);
      if (await deliver(alert, recipients, { escalatedAfterMinutes: minutes })) {
        escalated += 1;
      } else {
        await alertsRepository.releaseEscalation(claimed.AlertID);
      }
    } catch (error) {
      logger.error({ err: error, alertId: claimed.AlertID }, 'Alert escalation failed; will retry');
      await alertsRepository.releaseEscalation(claimed.AlertID).catch(() => {});
    }
  }

  if (escalated) logger.info({ escalated }, 'Escalated unresolved alerts');
  return escalated;
}
