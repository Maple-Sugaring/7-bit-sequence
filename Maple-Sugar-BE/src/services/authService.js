/**
 * Resolves a verified Google identity to an application account.
 *
 * Invite-first: an admin creates the account and assigns its role, and the
 * Google handshake only ever links an identity to an account that already
 * exists. Self-provisioning on first sign-in would mean anyone with an address
 * in an allowed domain could grant themselves a role, which for a course system
 * on an rit.edu domain is most of the university.
 */

import { ApiError, accountExpired, forbidden } from '../lib/ApiError.js';
import { isAccountUsable } from '../business/permissions.js';
import { isAllowedDomain } from '../auth/googleOAuth.js';
import * as usersRepository from '../repositories/usersRepository.js';
import { logger } from '../lib/logger.js';

export async function resolveGoogleUser(profile) {
  if (!isAllowedDomain(profile.email)) {
    throw forbidden('Sign in with your RIT account.');
  }

  // The durable key. Survives the user changing their email at Google.
  let user = await usersRepository.findUserByGoogleSub(profile.googleSub);

  if (user) {
    user = (await usersRepository.touchLastLogin(user.UserID)) ?? user;
  } else {
    const invited = await usersRepository.findUserByEmail(profile.email);

    if (!invited) {
      logger.warn({ email: profile.email }, 'Sign-in refused for unprovisioned account');
      throw new ApiError(
        'No account is set up for that address. Ask an administrator for an invite.',
        { status: 403, code: 'NOT_PROVISIONED' },
      );
    }

    // First sign-in against an invite: bind the identity so subsequent logins
    // match on google_sub instead.
    user =
      (await usersRepository.linkGoogleIdentity(invited.UserID, {
        googleSub: profile.googleSub,
        firstName: profile.firstName,
        lastName: profile.lastName,
      })) ?? invited;

    logger.info({ userId: user.UserID }, 'Linked Google identity to invited account');
  }

  // Checked after linking so a lapsed account still gets the specific expiry
  // message rather than looking like it was never invited.
  if (!isAccountUsable(user)) {
    throw accountExpired();
  }

  return user;
}

/**
 * Re-reads the account behind a session token.
 *
 * Called on every authenticated request, which is what makes deactivating an
 * account effective immediately instead of at token expiry.
 */
export async function loadSessionUser(payload) {
  if (!payload?.sub) return null;

  const user = await usersRepository.findUserById(Number(payload.sub));
  if (!user) return null;
  if (!isAccountUsable(user)) return null;

  return user;
}
