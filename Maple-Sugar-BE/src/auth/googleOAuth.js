/**
 * Google OAuth 2.0 authorization code flow.
 *
 * The code exchange happens server-side so the client secret never reaches the
 * browser. The alternative (Google Identity Services issuing an ID token in the
 * page) would leave this a public client and make the secret dead weight.
 */

import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';
import { ApiError } from '../lib/ApiError.js';

/** One web client per deployment. Identity and Calendar share this redirect. */
const client = new OAuth2Client({
  clientId: config.google.clientId,
  clientSecret: config.google.clientSecret,
  redirectUri: config.google.redirectUri,
});

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
];

/**
 * Opaque value tying the callback to the request that started it, defeating
 * login CSRF. Held in a short-lived httpOnly cookie and compared on return,
 * which needs no server-side store.
 */
export function createState() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Timing-safe comparison. A plain `===` on a secret leaks its prefix through
 * response timing.
 */
export function statesMatch(fromCookie, fromQuery) {
  if (!fromCookie || !fromQuery) return false;
  const a = Buffer.from(String(fromCookie));
  const b = Buffer.from(String(fromQuery));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function buildAuthorizationUrl(state) {
  return client.generateAuthUrl({
    scope: SCOPES,
    state,
    access_type: 'offline',
    // Account chooser for shared lab machines, plus consent so Google returns
    // the Calendar refresh token in this same handshake.
    prompt: 'select_account consent',
    include_granted_scopes: true,
  });
}

/**
 * Exchanges an authorization code for a verified Google identity.
 *
 * Returns the claims we need, having verified the ID token's signature,
 * audience, and issuer via google-auth-library.
 */
export async function exchangeCodeForProfile(code) {
  let tokens;
  try {
    ({ tokens } = await client.getToken(code));
  } catch (error) {
    throw new ApiError('Google rejected the sign-in attempt. Try again.', {
      status: 401,
      code: 'BAD_CREDENTIALS',
      cause: error,
    });
  }

  if (!tokens?.id_token) {
    throw new ApiError('Google did not return an identity token.', {
      status: 502,
      code: 'OAUTH_FAILED',
    });
  }

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.google.clientId,
    });
    payload = ticket.getPayload();
  } catch (error) {
    throw new ApiError('Could not verify the identity token from Google.', {
      status: 401,
      code: 'BAD_CREDENTIALS',
      cause: error,
    });
  }

  // An unverified email must not be trusted: without this check, anyone able to
  // create a Google account claiming an invited address could take it over.
  if (!payload?.email || payload.email_verified === false) {
    throw new ApiError('Your Google account has no verified email address.', {
      status: 403,
      code: 'EMAIL_UNVERIFIED',
    });
  }

  return {
    googleSub: payload.sub,
    email: payload.email.toLowerCase(),
    firstName: payload.given_name ?? '',
    lastName: payload.family_name ?? '',
    hostedDomain: payload.hd ?? null,
    refreshToken: tokens.refresh_token ?? null,
  };
}

/** Domain allowlist, so a personal Gmail cannot sign in to a course system. */
export function isAllowedDomain(email) {
  if (!config.allowedEmailDomains.length) return true;
  const domain = String(email).split('@')[1]?.toLowerCase();
  return Boolean(domain) && config.allowedEmailDomains.includes(domain);
}
