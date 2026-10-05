/**
 * Shift emails: signup confirmations, admin assignments and removals, time
 * changes, cancellations, and the reminder before a shift starts.
 *
 * Every export is best-effort and never throws, matching calendarService: the
 * schedule is the source of truth and a Brevo outage must not block a signup.
 * Users who turned shift email off, or whose account is inactive, are skipped.
 */

import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import * as scheduleRepository from '../repositories/scheduleRepository.js';
import * as usersRepository from '../repositories/usersRepository.js';
import {
  shiftAssignedEmail,
  shiftCancelledEmail,
  shiftChangedEmail,
  shiftReminderEmail,
  shiftRemovedEmail,
} from './emailTemplates.js';
import { isMailEnabled, sendEmail, sendQuietly } from './mailService.js';

async function recipient(userId) {
  const user = await usersRepository.findUserById(userId);
  if (!user || !user.Is_Active || !user.Email_Shifts) return null;
  return user;
}

async function mailUser(userId, message, tags) {
  if (!isMailEnabled()) return;
  try {
    const user = await recipient(userId);
    if (user) await sendQuietly({ to: user, ...message, tags: ['shift', ...tags] });
  } catch (error) {
    logger.error({ err: error, userId }, 'Shift email failed');
  }
}

export function notifyShiftAssigned(userId, slot, { byAdmin = false } = {}) {
  return mailUser(userId, shiftAssignedEmail(slot, { byAdmin }), [byAdmin ? 'assigned' : 'signup']);
}

export function notifyShiftRemoved(userId, slot, { byAdmin = false } = {}) {
  return mailUser(userId, shiftRemovedEmail(slot, { byAdmin }), ['removed']);
}

export async function notifyShiftChanged(slot) {
  await Promise.all(
    (slot.Assigned_UserIDs ?? []).map((userId) => mailUser(userId, shiftChangedEmail(slot), ['changed'])),
  );
}

/** Takes the user ids up front because the slot row is already gone. */
export async function notifyShiftCancelled(slot, userIds) {
  await Promise.all(userIds.map((userId) => mailUser(userId, shiftCancelledEmail(slot), ['cancelled'])));
}

/**
 * Sends reminders for shifts starting within SHIFT_REMINDER_HOURS. Called by
 * housekeeping. A failed send is released so the next pass retries it.
 */
export async function sendShiftReminders() {
  if (!isMailEnabled()) return 0;

  const due = await scheduleRepository.claimDueReminders(config.shiftReminderHours);
  let sent = 0;

  for (const { slotId, userId } of due) {
    try {
      const [slot, user] = await Promise.all([
        scheduleRepository.findSlotById(slotId),
        recipient(userId),
      ]);
      if (!slot || !user) continue;
      await sendEmail({ to: user, ...shiftReminderEmail(slot), tags: ['shift', 'reminder'] });
      sent += 1;
    } catch (error) {
      logger.error({ err: error, slotId, userId }, 'Shift reminder failed; will retry');
      await scheduleRepository.releaseReminder(slotId, userId).catch(() => {});
    }
  }

  if (sent) logger.info({ sent }, 'Sent shift reminders');
  return sent;
}
