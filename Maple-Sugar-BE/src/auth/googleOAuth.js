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

const client = new OAuth2Client({
  clientId: config.google.clientId,
  clientSecret: config.google.clientSecret,
  redirectUri: config.google.redirectUri,
});

const calendarClient = new OAuth2Client({
  clientId: config.google.clientId,
  clientSecret: config.google.clientSecret,
  redirectUri: config.google.calendarRedirectUri,
});

const SCOPES = ['openid', 'email', 'profile'];
const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

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
    // Always show the chooser: shared lab machines are the normal case here, and
    // silently reusing whichever Google account the browser saw last is how a
    // student ends up recording readings as someone else.
    prompt: 'select_account',
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
  };
}

export function buildCalendarAuthorizationUrl(state) {
  return calendarClient.generateAuthUrl({
    scope: CALENDAR_SCOPES,
    state,
    access_type: 'offline',
    // Consent is required or Google will not issue a refresh token on reconnect.
    prompt: 'consent',
    include_granted_scopes: true,
  });
}

/**
 * Exchanges a Calendar-connect code for a refresh token we can use later
 * without sending the user through Google again.
 */
export async function exchangeCodeForCalendarTokens(code) {
  let tokens;
  try {
    ({ tokens } = await calendarClient.getToken(code));
  } catch (error) {
    throw new ApiError('Google rejected the Calendar connection. Try again.', {
      status: 401,
      code: 'BAD_CREDENTIALS',
      cause: error,
    });
  }

  if (!tokens?.refresh_token) {
    throw new ApiError(
      'Google did not return a Calendar refresh token. Disconnect the app in your Google account and try again.',
      { status: 502, code: 'OAUTH_FAILED' },
    );
  }

  return { refreshToken: tokens.refresh_token };
}

/** Domain allowlist, so a personal Gmail cannot sign in to a course system. */
export function isAllowedDomain(email) {
  if (!config.allowedEmailDomains.length) return true;
  const domain = String(email).split('@')[1]?.toLowerCase();
  return Boolean(domain) && config.allowedEmailDomains.includes(domain);
}
