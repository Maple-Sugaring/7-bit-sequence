import { Router } from 'express';
import { forbidden } from '../lib/ApiError.js';
import { Capability, ROLE_LABELS, can } from '../business/permissions.js';
import { requireAuth } from '../middleware/authenticate.js';
import { cacheNamespaces } from '../cache/cacheKeys.js';
import { invalidateNamespaces } from '../cache/redisCache.js';
import * as usersRepository from '../repositories/usersRepository.js';
import { isMailEnabled } from '../services/mailService.js';
import { updateProfileBody } from './schemas.js';

/**
 * The signed-in person's own account. Every role can read and edit it; what
 * they can change is limited to names, pronouns, and email preferences.
 */
export const profileRouter = Router();

function profileFor(user, role) {
  return {
    ...user,
    Role_Label: ROLE_LABELS[role] ?? role,
    // Lets the UI hide the alert toggle for roles that never see alerts.
    Can_Receive_Alerts: can(role, Capability.VIEW_ALERTS),
    // False until the server has a Brevo key, so the UI can say why nothing arrives.
    Mail_Enabled: isMailEnabled(),
  };
}

profileRouter.get('/', requireAuth, (req, res) => {
  res.json(profileFor(req.user, req.role));
});

profileRouter.patch('/', requireAuth, async (req, res) => {
  const changes = updateProfileBody.parse(req.body);

  if (changes.Email_Alerts && !can(req.role, Capability.VIEW_ALERTS)) {
    throw forbidden('Your role does not receive alerts.');
  }

  const user = await usersRepository.updateProfile(req.user.UserID, changes);
  // Names and pronouns show on the roster and on schedule chips.
  await invalidateNamespaces([cacheNamespaces.USERS, cacheNamespaces.SCHEDULE]);
  res.json(profileFor(user, req.role));
});
