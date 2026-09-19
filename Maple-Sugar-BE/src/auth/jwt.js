/**
 * Session tokens.
 *
 * The session is a signed JWT carried in an httpOnly cookie. The cookie is what
 * makes a refresh survive: the frontend's transport only re-applies a Bearer
 * token on an explicit login, so a token held in memory or localStorage is
 * silently dropped on the next page load. Bearer is still accepted for
 * non-browser callers.
 *
 * The payload holds only an id and the claims needed to authorize a request.
 * Everything else is read from the database per request, so deactivating an
 * account takes effect immediately rather than whenever the token expires.
 */

import jwt from 'jsonwebtoken';
import { config, sessionTtlSeconds } from '../config.js';

const ISSUER = 'maple-sugar-api';

export function signSessionToken(user) {
  return jwt.sign(
    {
      sub: String(user.UserID),
      email: user.Email,
      roleId: user.RoleID,
    },
    config.jwtSecret,
    { expiresIn: sessionTtlSeconds, issuer: ISSUER },
  );
}

/** Returns the payload, or null for anything malformed, expired, or unsigned. */
export function verifySessionToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, config.jwtSecret, {
      issuer: ISSUER,
      // Pinned so a token cannot arrive claiming alg:none and verify trivially.
      algorithms: ['HS256'],
    });
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    // Lax rather than Strict: the OAuth callback is a top-level cross-site
    // redirect back from Google, and Strict would withhold the cookie on
    // exactly that navigation.
    sameSite: 'lax',
    // Secure cookies are refused on plain HTTP, including the Docker stack on
    // http://localhost:8080. NODE_ENV=production alone is not enough.
    secure: config.publicWebUrl.startsWith('https://'),
    path: '/',
    maxAge: sessionTtlSeconds * 1000,
  };
}

export function stateCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.publicWebUrl.startsWith('https://'),
    path: '/',
    // Only needs to outlive the trip to Google's consent screen.
    maxAge: 10 * 60 * 1000,
  };
}
