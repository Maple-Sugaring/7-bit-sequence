import { Router } from 'express';
import { forbidden, invalid, notFound } from '../lib/ApiError.js';
import { Capability, can } from '../business/permissions.js';
import { requireCapability } from '../middleware/authenticate.js';
import { cacheKeys, cacheNamespaces, TTL } from '../cache/cacheKeys.js';
import { invalidateNamespaces, readThrough } from '../cache/redisCache.js';
import * as scheduleRepository from '../repositories/scheduleRepository.js';
import * as calendarService from '../services/calendarService.js';
import { createSlotBody, idParam, scheduleQuery, slotUserBody, updateSlotBody } from './schemas.js';

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

scheduleRouter.post('/slots', requireCapability(Capability.MANAGE_SCHEDULE), async (req, res) => {
  const body = createSlotBody.parse(req.body);
  const slot = await scheduleRepository.createSlot(body);

  await invalidateNamespaces([cacheNamespaces.SCHEDULE]);
  res.status(201).json(slot);
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
