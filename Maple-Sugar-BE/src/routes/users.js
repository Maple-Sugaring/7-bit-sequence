import { Router } from 'express';
import { forbidden, invalid, notFound } from '../lib/ApiError.js';
import { Capability } from '../business/permissions.js';
import { requireCapability } from '../middleware/authenticate.js';
import { cacheKeys, cacheNamespaces, TTL } from '../cache/cacheKeys.js';
import { invalidateNamespaces, readThrough } from '../cache/redisCache.js';
import * as usersRepository from '../repositories/usersRepository.js';
import { idParam, inviteUserBody, updateUserBody } from './schemas.js';

export const usersRouter = Router();

const ROLE_STUDENT = 2;
/** A term and a bit, so an invite issued mid-semester still covers finals. */
const DEFAULT_EXPIRY_MONTHS = 4;

function defaultExpiry() {
  const date = new Date();
  date.setMonth(date.getMonth() + DEFAULT_EXPIRY_MONTHS);
  return date.toISOString().slice(0, 10);
}

usersRouter.get('/', requireCapability(Capability.MANAGE_USERS), async (req, res) => {
  const users = await readThrough(cacheKeys.users(), TTL.USERS, () => usersRepository.listUsers());
  res.json(users);
});

/**
 * Creates the account an invited person will later claim by signing in with
 * Google. Nothing is emailed: the account simply exists, and their first Google
 * sign-in links to it.
 */
usersRouter.post('/invite', requireCapability(Capability.MANAGE_USERS), async (req, res) => {
  const body = inviteUserBody.parse(req.body);
  const email = body.email.trim();

  // Checked explicitly so the response is a field-level 422 the invite form can
  // show on the email input, rather than a bare unique-constraint violation.
  const existing = await usersRepository.findUserByEmail(email);
  if (existing) {
    throw invalid('That email already has an account.', { email: 'duplicate' });
  }

  const user = await usersRepository.createInvite({
    email,
    roleId: body.roleId ?? ROLE_STUDENT,
    // Falling back to the local part gives the roster something readable until
    // their Google profile fills in the real name on first sign-in.
    firstName: body.firstName ?? email.split('@')[0],
    lastName: body.lastName ?? '',
    accountExpiry: body.accountExpiry ?? defaultExpiry(),
  });

  await invalidateNamespaces([cacheNamespaces.USERS]);
  res.status(201).json(user);
});

usersRouter.patch('/:id', requireCapability(Capability.MANAGE_USERS), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const changes = updateUserBody.parse(req.body);

  // An admin demoting or deactivating themselves would lock the last
  // administrator out of the system with no way back in.
  if (id === req.user.UserID) {
    if (changes.RoleID != null && changes.RoleID !== req.user.RoleID) {
      throw forbidden('You cannot change your own role.');
    }
    if (changes.Is_Active === false) {
      throw forbidden('You cannot deactivate your own account.');
    }
  }

  const user = await usersRepository.updateUser(id, changes);
  if (!user) throw notFound('User');

  await invalidateNamespaces([cacheNamespaces.USERS]);
  res.json(user);
});

usersRouter.delete('/:id', requireCapability(Capability.MANAGE_USERS), async (req, res) => {
  const id = idParam.parse(req.params.id);

  if (id === req.user.UserID) {
    throw forbidden('You cannot delete your own account.');
  }

  // Readings and collection logs survive with their attribution nulled, per the
  // ON DELETE SET NULL in migration 002.
  const removed = await usersRepository.deleteUser(id);
  if (!removed) throw notFound('User');

  await invalidateNamespaces([cacheNamespaces.USERS]);
  res.status(204).end();
});
