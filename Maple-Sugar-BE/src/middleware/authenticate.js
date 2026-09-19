/**
 * Session resolution and access control.
 *
 * `attachUser` runs on every request and is permissive; `requireAuth` and
 * `requireCapability` are the gates. Splitting them lets a route like
 * GET /auth/session report "no session" as a 200 with null rather than a 401.
 */

import { config } from '../config.js';
import { unauthorized, forbidden } from '../lib/ApiError.js';
import { verifySessionToken } from '../auth/jwt.js';
import { loadSessionUser } from '../services/authService.js';
import { can, roleFromId } from '../business/permissions.js';

/** Cookie first, since that is how the browser authenticates. */
function tokenFrom(req) {
  const cookieToken = req.cookies?.[config.sessionCookieName];
  if (cookieToken) return cookieToken;

  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();

  return null;
}

export async function attachUser(req, res, next) {
  try {
    const payload = verifySessionToken(tokenFrom(req));
    // Reloaded from the database rather than trusted from the token, so a
    // revoked or expired account cannot keep working until its token lapses.
    const user = payload ? await loadSessionUser(payload) : null;

    req.user = user;
    req.role = user ? roleFromId(user.RoleID) : null;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) return next(unauthorized('Sign in to continue.'));
  next();
}

/**
 * Enforces the capability matrix server-side.
 *
 * The frontend checks the same matrix to decide what to render, but that is a
 * usability affordance. This is the control: hiding a button does not stop a
 * request being sent by hand.
 */
export function requireCapability(capability) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized('Sign in to continue.'));
    if (!can(req.role, capability)) {
      return next(forbidden('Your role does not allow that.'));
    }
    next();
  };
}

/**
 * Any one of the listed capabilities is enough.
 *
 * The dashboard is assembled client-side from metrics, nodes, gateways, buckets,
 * alerts, and collection logs. MSS members can view that dashboard but do not
 * have the per-page capabilities (view_nodes, view_alerts), so those GETs have
 * to accept view_dashboard as well or the page loads empty for them.
 */
export function requireAnyCapability(...capabilities) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized('Sign in to continue.'));
    if (capabilities.some((capability) => can(req.role, capability))) return next();
    next(forbidden('Your role does not allow that.'));
  };
}

/** Lets a user act on their own record while admins act on anyone's. */
export function requireSelfOrCapability(capability, paramName = 'id') {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized('Sign in to continue.'));

    const targetId = Number(req.params[paramName]);
    if (req.user.UserID === targetId) return next();
    if (can(req.role, capability)) return next();

    next(forbidden('Your role does not allow that.'));
  };
}
