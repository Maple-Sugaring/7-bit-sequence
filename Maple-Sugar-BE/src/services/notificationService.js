/**
 * Outbound critical alerts.
 *
 * In-app notifications already exist. Email goes through Brevo's free tier to
 * opted-in users plus ALERT_EMAILS, and only once BREVO_API_KEY and MAIL_FROM
 * are set, so a laptop checkout never mails the crew.
 */

import { config } from '../config.js';
import { logger } from '../lib/logger.js';
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

async function sendAlertEmail(alert) {
  if (!isMailEnabled()) return;
  const users = await usersRepository.listAlertRecipients();
  await sendEmail({
    to: [...users, ...config.alertEmails],
    ...criticalAlertEmail(alert),
    tags: ['alert', alert.Alert_Type],
  });
}

/** Never throws into the request that created the alert. */
export async function notifyCriticalAlert(alert) {
  if (!shouldNotify(alert)) return;

  try {
    await sendAlertEmail(await withNodeName(alert));
  } catch (error) {
    logger.error({ err: error, alertType: alert.Alert_Type }, 'Critical notification failed');
  }
}
