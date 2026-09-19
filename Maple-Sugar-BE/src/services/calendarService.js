/**
 * Push claimed shifts onto a user's Google Calendar.
 *
 * Maple Sugaring remains the source of truth. Calendar writes are best-effort:
 * a Google outage must not block signup, withdraw, or admin edits.
 */

import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import * as usersRepository from '../repositories/usersRepository.js';
import * as scheduleRepository from '../repositories/scheduleRepository.js';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

function calendarClient() {
  return new OAuth2Client({
    clientId: config.google.clientId,
    clientSecret: config.google.clientSecret,
  });
}

async function accessTokenFor(userId) {
  const refreshToken = await usersRepository.getGoogleRefreshToken(userId);
  if (!refreshToken) return null;

  const client = calendarClient();
  client.setCredentials({ refresh_token: refreshToken });
  const { token } = await client.getAccessToken();
  return token ?? null;
}

function eventBody(slot) {
  return {
    summary: `${slot.Task} — ${slot.Stand}`,
    location: slot.Stand,
    description: 'RIT Maple Sugaring shift',
    start: { dateTime: slot.Starts_At },
    end: { dateTime: slot.Ends_At },
  };
}

async function calendarFetch(token, path, { method = 'GET', body } = {}) {
  const response = await fetch(`${CALENDAR_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : null),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message ?? `Calendar API ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function upsertEvent(userId, slot, existingEventId) {
  const token = await accessTokenFor(userId);
  if (!token) return null;

  const calendarId = encodeURIComponent('primary');
  const body = eventBody(slot);

  if (existingEventId) {
    try {
      const updated = await calendarFetch(
        token,
        `/calendars/${calendarId}/events/${encodeURIComponent(existingEventId)}`,
        { method: 'PATCH', body },
      );
      return updated?.id ?? existingEventId;
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }

  const created = await calendarFetch(token, `/calendars/${calendarId}/events`, {
    method: 'POST',
    body,
  });
  return created?.id ?? null;
}

async function removeEvent(userId, eventId) {
  if (!eventId) return;
  const token = await accessTokenFor(userId);
  if (!token) return;

  try {
    await calendarFetch(
      token,
      `/calendars/${encodeURIComponent('primary')}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' },
    );
  } catch (error) {
    if (error.status === 404 || error.status === 410) return;
    throw error;
  }
}

export async function syncSignup(userId, slot) {
  try {
    const eventId = await upsertEvent(userId, slot, null);
    if (eventId) await scheduleRepository.setAssignmentEventId(slot.SlotID, userId, eventId);
  } catch (error) {
    logger.warn({ err: error, userId, slotId: slot.SlotID }, 'Calendar signup sync failed');
  }
}

export async function syncWithdraw(userId, eventId) {
  try {
    await removeEvent(userId, eventId);
  } catch (error) {
    logger.warn({ err: error, userId }, 'Calendar withdraw sync failed');
  }
}

export async function syncSlotChange(slot) {
  try {
    const assignments = await scheduleRepository.listAssignments(slot.SlotID);
    await Promise.all(
      assignments.map(async (assignment) => {
        const eventId = await upsertEvent(assignment.userId, slot, assignment.googleEventId);
        if (eventId && eventId !== assignment.googleEventId) {
          await scheduleRepository.setAssignmentEventId(slot.SlotID, assignment.userId, eventId);
        }
      }),
    );
  } catch (error) {
    logger.warn({ err: error, slotId: slot.SlotID }, 'Calendar slot update sync failed');
  }
}

export async function syncSlotDelete(assignments) {
  await Promise.all(
    assignments.map((assignment) =>
      syncWithdraw(assignment.userId, assignment.googleEventId),
    ),
  );
}

/** After a user connects Calendar, copy their upcoming claimed shifts over. */
export async function backfillUserCalendar(userId) {
  const slots = await scheduleRepository.listUpcomingSlotsForUser(userId);
  for (const slot of slots) {
    await syncSignup(userId, slot);
  }
}
