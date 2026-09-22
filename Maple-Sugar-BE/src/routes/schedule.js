import { Router } from 'express';
import { ApiError, forbidden, invalid, notFound } from '../lib/ApiError.js';
import { Capability, can } from '../business/permissions.js';
import { requireCapability } from '../middleware/authenticate.js';
import { cacheKeys, cacheNamespaces, TTL } from '../cache/cacheKeys.js';
import { invalidateNamespaces, readThrough } from '../cache/redisCache.js';
import * as scheduleRepository from '../repositories/scheduleRepository.js';
import * as calendarService from '../services/calendarService.js';
import { claimTimeBody, createSlotBody, idParam, scheduleQuery, slotUserBody, updateSlotBody } from './schemas.js';
import { queryAll } from '../db/pool.js';
import * as usersRepository from '../repositories/usersRepository.js';

export const scheduleRouter = Router();

scheduleRouter.get('/slots', requireCapability(Capability.VIEW_SCHEDULE), async (req, res) => {
  const { from, to } = scheduleQuery.parse(req.query);

  const slots = await readThrough(
    // 'any' rather than an empty segment, matching the frontend's key builder so
    // an unbounded query is not two different keys across the two caches.
    cacheKeys.scheduleSlots(from ?? 'any', to ?? 'any'),
    TTL.SCHEDULE,
    () => scheduleRepository.listSlots({ from, to }),
  );
  res.json(slots);
});

scheduleRouter.get('/availability', requireCapability(Capability.VIEW_SCHEDULE), async (req, res) => {
  try {
    const availability = await calendarService.availabilityFor(req.user.UserID);
    if (!availability) {
      throw new ApiError('Sign in again to connect Google Calendar, then pick a time.', {
        status: 409,
        code: 'CALENDAR_REQUIRED',
      });
    }
    res.json(availability);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Google Calendar did not return your free times.', {
      status: 502,
      code: 'OAUTH_FAILED',
      cause: error,
    });
  }
});

scheduleRouter.post('/slots', requireCapability(Capability.MANAGE_SCHEDULE), async (req, res) => {
  const body = createSlotBody.parse(req.body);
  const assignee = await usersRepository.findUserById(body.UserID);
  if (!assignee) throw invalid('Choose a student who already has an account.', { UserID: 'missing' });

  const buckets = await queryAll(
    `select b.id, n.id as node_id, n.stand, n.node_name
       from buckets b
       join node n on n.id = b.node_id
      where b.id = any($1::int[])`,
    [body.BucketIDs],
  );
  if (buckets.length !== body.BucketIDs.length) {
    throw invalid('One of those buckets is not on a tree.');
  }

  const stands = [...new Set(buckets.map((bucket) => bucket.stand).filter(Boolean))];
  const slot = await scheduleRepository.createSlot({
    Task: body.Task,
    Stand: stands.join(', ') || 'Sugarbush',
    Starts_At: body.Starts_At,
    Ends_At: body.Ends_At,
    Capacity: 1,
    Node_ID: buckets[0].node_id,
    Notes: body.Notes,
    Bucket_IDs: body.BucketIDs,
  });

  let assigned;
  try {
    assigned = await scheduleRepository.signUp(slot.SlotID, body.UserID);
  } catch (error) {
    await scheduleRepository.deleteSlot(slot.SlotID);
    throw error;
  }

  await invalidateNamespaces([cacheNamespaces.SCHEDULE]);
  res.status(201).json(assigned);
  void calendarService.syncSignup(body.UserID, assigned);
});

scheduleRouter.patch('/slots/:id', requireCapability(Capability.MANAGE_SCHEDULE), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const changes = updateSlotBody.parse(req.body);

  const existing = await scheduleRepository.findSlotById(id);
  if (!existing) throw notFound('Shift');

  // Reducing capacity below the number already signed up would leave the shift
  // overbooked with no way for the UI to represent it.
  if (changes.Capacity != null && changes.Capacity < existing.Assigned_UserIDs.length) {
    throw invalid(
      `${existing.Assigned_UserIDs.length} people are already signed up. Remove someone first.`,
      { Capacity: 'below_signups' },
    );
  }

  const slot = await scheduleRepository.updateSlot(id, changes);
  await invalidateNamespaces([cacheNamespaces.SCHEDULE]);

  if (changes.Task != null || changes.Stand != null || changes.Starts_At != null || changes.Ends_At != null) {
    await calendarService.syncSlotChange(slot);
  }

  res.json(slot);
});

scheduleRouter.delete('/slots/:id', requireCapability(Capability.MANAGE_SCHEDULE), async (req, res) => {
  const id = idParam.parse(req.params.id);

  const assignments = await scheduleRepository.listAssignments(id);
  const removed = await scheduleRepository.deleteSlot(id);
  if (!removed) throw notFound('Shift');

  await invalidateNamespaces([cacheNamespaces.SCHEDULE]);
  await calendarService.syncSlotDelete(assignments);
  res.status(204).end();
});

/**
 * Resolves whose signup this is.
 *
 * Defaults to the caller. Signing someone else up is a scheduling action, so it
 * needs MANAGE_SCHEDULE; without that check any student could fill a shift with
 * a classmate's name.
 */
function resolveTargetUser(req) {
  const { userId } = slotUserBody.parse(req.body ?? {});
  if (userId == null || userId === req.user.UserID) return req.user.UserID;

  if (!can(req.role, Capability.MANAGE_SCHEDULE)) {
    throw forbidden('You can only change your own shifts.');
  }
  return userId;
}

scheduleRouter.post('/slots/:id/claim-time', requireCapability(Capability.CLAIM_SHIFT), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { Starts_At: startsAt, Ends_At: endsAt } = claimTimeBody.parse(req.body);
  const userId = req.user.UserID;

  const slot = await scheduleRepository.findSlotById(id);
  if (!slot) throw notFound('Shift');
  if (!slot.Awaiting_Time) throw invalid('This collection already has a time.');

  let availability;
  try {
    availability = await calendarService.availabilityFor(userId);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Google Calendar did not return your free times.', {
      status: 502,
      code: 'OAUTH_FAILED',
      cause: error,
    });
  }

  if (!availability) {
    throw new ApiError('Sign in again to connect Google Calendar, then pick a time.', {
      status: 409,
      code: 'CALENDAR_REQUIRED',
    });
  }

  const match = availability.Windows.find(
    (window) => Math.abs(Date.parse(window.Starts_At) - Date.parse(startsAt)) < 60_000,
  );
  if (!match || Math.abs(Date.parse(match.Ends_At) - Date.parse(endsAt)) > 60_000) {
    throw invalid('That time is not open on your calendar. Pick another window.');
  }

  const updated = await scheduleRepository.claimTime(id, userId, match.Starts_At, match.Ends_At);
  await invalidateNamespaces([cacheNamespaces.SCHEDULE, cacheNamespaces.ALERTS]);
  await calendarService.syncSignup(userId, updated);
  res.json(updated);
});

scheduleRouter.post('/slots/:id/signup', requireCapability(Capability.CLAIM_SHIFT), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const userId = resolveTargetUser(req);

  // Capacity and overlap are enforced inside a locked transaction in the
  // repository, since they are only sound while the slot row is held.
  const slot = await scheduleRepository.signUp(id, userId);

  await invalidateNamespaces([cacheNamespaces.SCHEDULE]);
  await calendarService.syncSignup(userId, slot);
  res.json(slot);
});

scheduleRouter.post('/slots/:id/withdraw', requireCapability(Capability.CLAIM_SHIFT), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const userId = resolveTargetUser(req);

  const { slot, googleEventId } = await scheduleRepository.withdraw(id, userId);

  await invalidateNamespaces([cacheNamespaces.SCHEDULE]);
  await calendarService.syncWithdraw(userId, googleEventId);
  res.json(slot);
});
