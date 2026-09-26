/**
 * Authentication routes.
 *
 * There is deliberately no POST /auth/login. The schema has no password column,
 * so Google is the only credential, and an endpoint that always fails would just
 * invite someone to wire a form up to it.
 */

import { Router } from 'express';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { ApiError, unauthorized } from '../lib/ApiError.js';
import {
  buildAuthorizationUrl,
  createState,
  exchangeCodeForProfile,
  statesMatch,
} from '../auth/googleOAuth.js';
import {
  accessCookieOptions,
  clearAuthCookies,
  refreshCookieOptions,
  signAccessToken,
  stateCookieOptions,
} from '../auth/jwt.js';
import { requireAuth } from '../middleware/authenticate.js';
import { resolveGoogleUser } from '../services/authService.js';
import * as sessionService from '../services/sessionService.js';
import * as calendarService from '../services/calendarService.js';
import * as usersRepository from '../repositories/usersRepository.js';

export const authRouter = Router();

/** Metadata stamped on a session row for auditing and reuse forensics. */
function requestMeta(req) {
  return { userAgent: req.get('user-agent') ?? null, ip: req.ip ?? null };
}

/** Sets both auth cookies from an issued/rotated pair. */
function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie(config.sessionCookieName, accessToken, accessCookieOptions());
  res.cookie(config.refreshCookieName, refreshToken, refreshCookieOptions());
}

/**
 * Starts the handshake. A GET that redirects, because it is reached by a plain
 * browser navigation from the login page rather than by fetch.
 */
authRouter.get('/google', (req, res) => {
  const state = createState();
  res.cookie(config.stateCookieName, state, stateCookieOptions());
  res.redirect(buildAuthorizationUrl(state));
});

/**
 * Google returns the browser here.
 *
 * Failures redirect back to the login page with a message rather than returning
 * JSON: the user is mid-navigation, and a raw error document in the address bar
 * is a dead end with no way back into the app.
 */
authRouter.get('/google/callback', async (req, res) => {
  const loginUrl = new URL('/login', config.publicWebUrl);

  const fail = (message, logContext) => {
    logger.warn(logContext, 'OAuth callback rejected');
    loginUrl.searchParams.set('error', message);
    res.clearCookie(config.stateCookieName, { path: '/' });
    return res.redirect(loginUrl.toString());
  };

  // The user declined consent, or Google refused outright.
  if (req.query.error) {
    return fail('Google sign-in was cancelled.', { reason: req.query.error });
  }

  const code = typeof req.query.code === 'string' ? req.query.code : null;
  if (!code) return fail('Google sign-in did not complete. Try again.', { reason: 'missing_code' });

  if (!statesMatch(req.cookies?.[config.stateCookieName], req.query.state)) {
    // Either a forged callback or a stale tab whose state cookie has expired.
    return fail('That sign-in link has expired. Try again.', { reason: 'state_mismatch' });
  }

  res.clearCookie(config.stateCookieName, { path: '/' });

  try {
    const profile = await exchangeCodeForProfile(code);
    const user = await resolveGoogleUser(profile);

    setAuthCookies(res, await sessionService.issueSession(user, requestMeta(req)));
    logger.info({ userId: user.UserID }, 'Session established');

    if (profile.refreshToken) {
      await usersRepository.saveCalendarConnection(user.UserID, profile.refreshToken);
      try {
        await calendarService.backfillUserCalendar(user.UserID);
      } catch (error) {
        logger.warn({ err: error, userId: user.UserID }, 'Calendar backfill after sign-in failed');
      }
    }

    // Lands on a route that pulls the session and forwards to the role's home.
    return res.redirect(new URL('/auth/callback', config.publicWebUrl).toString());
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) {
      return fail(error.message, { code: error.code });
    }
    logger.error({ err: error }, 'OAuth callback failed');
    return fail('Sign-in failed unexpectedly. Try again.', { reason: 'internal' });
  }
});

/**
 * Current session, or null.
 *
 * 200 with a null body rather than 401, because the app calls this on every load
 * to find out whether anyone is signed in, and "nobody is" is a normal answer.
 * The token is echoed back so the client can also use Bearer if it wants to.
 */
authRouter.get('/session', (req, res) => {
  if (!req.user) return res.json(null);

  res.json({
    token: req.cookies?.[config.sessionCookieName] ?? signAccessToken(req.user),
    user: req.user,
  });
});

/**
 * Trades the long-lived refresh cookie for a fresh access token (and a rotated
 * refresh cookie). The frontend calls this transparently when a request comes
 * back 401, so a short access-token lifetime is invisible to the user.
 *
 * A rejected refresh clears both cookies and answers 401 rather than redirecting
 * — the caller is a fetch, not a top-level navigation.
 */
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const presented = req.cookies?.[config.refreshCookieName];
    const result = await sessionService.rotateSession(presented, requestMeta(req));

    if (!result.accessToken) {
      clearAuthCookies(res);
      const message =
        result.reason === 'reuse'
          ? 'This session was ended for security. Sign in again.'
          : 'Your session has expired. Sign in again.';
      return next(unauthorized(message));
    }

    setAuthCookies(res, result);
    res.json({ token: result.accessToken, user: result.user });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    // Best-effort revoke of the server-side session before the cookies go.
    await sessionService.endSession(req.cookies?.[config.refreshCookieName]);
    // Options must match those the cookies were set with, or the browser keeps them.
    clearAuthCookies(res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

/** Revokes every session for the signed-in user ("log out everywhere"). */
authRouter.post('/logout-all', requireAuth, async (req, res, next) => {
  try {
    await sessionService.endAllSessions(req.user.UserID);
    clearAuthCookies(res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

/**
 * Same Google handshake as sign-in. Kept so an already-open session can grant
 * Calendar without a second OAuth client or a second consent screen design.
 */
authRouter.get('/google/calendar', requireAuth, (req, res) => {
  const state = createState();
  res.cookie(config.stateCookieName, state, stateCookieOptions());
  res.redirect(buildAuthorizationUrl(state));
});

authRouter.delete('/calendar', requireAuth, async (req, res) => {
  await usersRepository.clearCalendarConnection(req.user.UserID);
  calendarService.forgetCalendarClient(req.user.UserID);
  res.status(204).end();
});
