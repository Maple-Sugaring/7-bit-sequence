/**
 * Session tokens: a short access token and a long refresh token.
 *
 * The access token is a signed JWT in an httpOnly cookie. It is stateless and
 * short-lived (minutes): every request re-loads the user from the database, so
 * a deactivated account stops working immediately rather than when the token
 * lapses. Bearer is still accepted for non-browser callers.
 *
 * The refresh token is NOT a JWT. It is an opaque random string; only its hash
 * is stored (in the `sessions` table), and the row is the source of truth. That
 * is what makes it revocable per-session — logout, "log out everywhere", and
 * rotation with reuse detection all work by touching that row, which a
 * self-contained signed token could never offer.
 *
 * The access token payload holds only an id and the claims needed to authorize
 * a request; everything else is read from the database per request.
 */

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config, accessTokenTtlSeconds, refreshTokenTtlSeconds } from '../config.js';

const ISSUER = 'maple-sugar-api';

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.UserID),
      email: user.Email,
      roleId: user.RoleID,
      typ: 'access',
    },
    config.jwtSecret,
    { expiresIn: accessTokenTtlSeconds, issuer: ISSUER },
  );
}

/** Returns the payload, or null for anything malformed, expired, or unsigned. */
export function verifyAccessToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      issuer: ISSUER,
      // Pinned so a token cannot arrive claiming alg:none and verify trivially.
      algorithms: ['HS256'],
    });
    // A refresh token is opaque and never verifies here, but reject anything
    // that explicitly claims to be a different token type all the same.
    if (payload.typ && payload.typ !== 'access') return null;
    return payload;
  } catch {
    return null;
  }
}

/** A fresh opaque refresh token. 32 bytes of entropy, URL-safe. */
export function generateRefreshToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Only the hash of a refresh token is stored, so a leaked database dump cannot
 * be replayed. SHA-256 is enough here: the token is already high-entropy random,
 * so there is nothing to brute-force the way there would be with a password.
 */
export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** True on the plain-HTTP dev stack, where `secure` cookies would be refused. */
function isHttps() {
  return config.publicWebUrl.startsWith('https://');
}

export function accessCookieOptions() {
  return {
    httpOnly: true,
    // Lax rather than Strict: the OAuth callback is a top-level cross-site
    // redirect back from Google, and Strict would withhold the cookie on
    // exactly that navigation.
    sameSite: 'lax',
    // Secure cookies are refused on plain HTTP, including the Docker stack on
    // http://localhost:8080. NODE_ENV=production alone is not enough.
    secure: isHttps(),
    path: '/',
    maxAge: accessTokenTtlSeconds * 1000,
  };
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps(),
    // Path '/' rather than a narrower '/auth': nginx (and the Vite proxy) strip
    // the '/api' prefix the browser sees, so a path scoped to the server-side
    // route would never match the browser-side URL and the cookie would go
    // unsent. httpOnly keeps it out of JS regardless of path.
    path: '/',
    maxAge: refreshTokenTtlSeconds * 1000,
  };
}

/** Clears both auth cookies with options that match how they were set. */
export function clearAuthCookies(res) {
  const base = { httpOnly: true, sameSite: 'lax', secure: isHttps(), path: '/' };
  res.clearCookie(config.sessionCookieName, base);
  res.clearCookie(config.refreshCookieName, base);
}

export function stateCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps(),
    path: '/',
    // Only needs to outlive the trip to Google's consent screen.
    maxAge: 10 * 60 * 1000,
  };
}
