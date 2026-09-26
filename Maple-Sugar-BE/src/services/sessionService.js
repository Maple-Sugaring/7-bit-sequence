/**
 * Issues and rotates the access/refresh token pair.
 *
 * Login mints a fresh family: a new refresh token plus the first access token.
 * A refresh spends the presented token and mints its successor in the same
 * family. Presenting a token that was already spent is treated as theft and
 * revokes the whole family — the legitimate holder is logged out too, which is
 * the safe outcome when a token is known to have leaked.
 */

import crypto from 'node:crypto';
import { isAccountUsable } from '../business/permissions.js';
import { refreshTokenTtlSeconds } from '../config.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from '../auth/jwt.js';
import * as sessionsRepository from '../repositories/sessionsRepository.js';
import * as usersRepository from '../repositories/usersRepository.js';
import { logger } from '../lib/logger.js';

function expiryFromNow() {
  return new Date(Date.now() + refreshTokenTtlSeconds * 1000);
}

/** Start of a session: a new family with its first refresh token. */
export async function issueSession(user, { userAgent, ip } = {}) {
  const refreshToken = generateRefreshToken();
  await sessionsRepository.createSession({
    userId: user.UserID,
    familyId: crypto.randomUUID(),
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: expiryFromNow(),
    userAgent,
    ip,
  });
  return { accessToken: signAccessToken(user), refreshToken };
}

/**
 * Rotates a presented refresh token.
 *
 * Returns { accessToken, refreshToken, user } on success, or one of:
 *   { reason: 'invalid' }  — unknown token
 *   { reason: 'reuse' }    — spent token replayed; family revoked
 *   { reason: 'expired' }  — past its absolute lifetime
 *   { reason: 'account' }  — account is gone or no longer usable
 */
export async function rotateSession(presentedToken, { userAgent, ip } = {}) {
  if (!presentedToken) return { reason: 'invalid' };

  const row = await sessionsRepository.findByTokenHash(hashRefreshToken(presentedToken));
  if (!row) return { reason: 'invalid' };

  // A token that was already rotated out or explicitly revoked must never work
  // again. Seeing one is the tell-tale of a stolen token, so the whole lineage
  // goes with it.
  if (row.revoked_at || row.replaced_by) {
    await sessionsRepository.revokeFamily(row.family_id);
    logger.warn({ userId: row.user_id, familyId: row.family_id }, 'Refresh token reuse detected');
    return { reason: 'reuse' };
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { reason: 'expired' };
  }

  const user = await usersRepository.findUserById(row.user_id);
  if (!user || !isAccountUsable(user)) {
    await sessionsRepository.revokeFamily(row.family_id);
    return { reason: 'account' };
  }

  const refreshToken = generateRefreshToken();
  await sessionsRepository.rotate({
    oldId: row.id,
    userId: user.UserID,
    familyId: row.family_id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: expiryFromNow(),
    userAgent,
    ip,
  });

  return { accessToken: signAccessToken(user), refreshToken, user };
}

/** Ends a single session (logout). Silent if the token is unknown. */
export async function endSession(presentedToken) {
  if (!presentedToken) return false;
  return sessionsRepository.revokeByTokenHash(hashRefreshToken(presentedToken));
}

/** Ends every session for a user (logout everywhere). */
export async function endAllSessions(userId) {
  return sessionsRepository.revokeAllForUser(userId);
}
