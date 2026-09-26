/**
 * Environment loading and validation.
 *
 * Config is read once at import so a misconfigured deployment fails on boot
 * with a list of everything that is wrong, rather than throwing on the first
 * request that happens to need a missing variable.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load Maple-Sugar-BE/.env when present. Already-set variables win, so Docker
// and a smoke-test env file can override without the local file fighting them.
const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const isProduction = process.env.NODE_ENV === 'production';

function required(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

function optional(name, fallback = '') {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function list(name) {
  return optional(name)
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function integer(name, fallback) {
  const parsed = Number.parseInt(optional(name), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Trailing slashes break byte-for-byte redirect_uri comparison at Google. */
function trimTrailingSlash(url) {
  return url.replace(/\/+$/, '');
}

const problems = [];

const databaseUrl = required('DATABASE_URL');
if (!databaseUrl) problems.push('DATABASE_URL is required.');

// JWT_SECRET is the API's own signing key, not a shared credential. It should
// differ per environment, and dev tokens have no value off a developer's own
// machine, so a fixed throwaway default is used when it is left unset outside
// production. Production still fails closed: a real, 32+ char secret is
// required and must live only on the prod host (injected at deploy time).
const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-in-production-0123456789';
let jwtSecret = required('JWT_SECRET');
if (!jwtSecret && !isProduction) jwtSecret = DEV_JWT_SECRET;
if (!jwtSecret) problems.push('JWT_SECRET is required in production.');
else if (jwtSecret.length < 32) problems.push('JWT_SECRET must be at least 32 characters.');

const googleClientId = required('GOOGLE_CLIENT_ID');
const googleClientSecret = required('GOOGLE_CLIENT_SECRET');
if (!googleClientId) problems.push('GOOGLE_CLIENT_ID is required.');
if (!googleClientSecret) problems.push('GOOGLE_CLIENT_SECRET is required.');

const publicApiUrl = trimTrailingSlash(optional('PUBLIC_API_URL', 'http://localhost:5173/api'));
const publicWebUrl = trimTrailingSlash(optional('PUBLIC_WEB_URL', 'http://localhost:5173'));

if (problems.length) {
  throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProduction,
  port: integer('PORT', 3000),
  logLevel: optional('LOG_LEVEL', isProduction ? 'info' : 'debug'),

  databaseUrl,
  // Optional on purpose: a Redis outage should degrade to direct SQL, not take
  // the API down with it.
  redisUrl: optional('REDIS_URL') || null,

  jwtSecret,
  // Short-lived, stateless access token. Kept small so a leaked token is only
  // useful for minutes; the frontend transparently mints a new one from the
  // refresh cookie when it expires.
  accessTokenTtlMinutes: integer('ACCESS_TOKEN_TTL_MINUTES', 15),
  // Long-lived, database-backed refresh token. This is the credential that
  // keeps a user signed in across restarts, and the only one that can be
  // revoked per-session (logout, logout-everywhere, reuse detection).
  refreshTokenTtlDays: integer('REFRESH_TOKEN_TTL_DAYS', 30),
  sessionCookieName: 'maple_session',
  refreshCookieName: 'maple_refresh',
  // Guards the OAuth handshake against CSRF; short-lived, so it never needs to
  // survive a restart.
  stateCookieName: 'maple_oauth_state',

  google: {
    clientId: googleClientId,
    clientSecret: googleClientSecret,
    /** Must exactly match an Authorized redirect URI in the Cloud Console. */
    get redirectUri() {
      return `${publicApiUrl}/auth/google/callback`;
    },
    /** Separate callback so login identity and Calendar consent stay distinct. */
    get calendarRedirectUri() {
      return `${publicApiUrl}/auth/google/calendar/callback`;
    },
  },

  publicApiUrl,
  publicWebUrl,
  allowedEmailDomains: list('ALLOWED_EMAIL_DOMAINS'),
  corsOrigins: [...new Set([publicWebUrl, ...list('CORS_ORIGINS')])].filter(Boolean),

  // RIT sugarbush, not a developer machine. Override when the stand moves.
  sugarbushLatitude: Number(optional('SUGARBUSH_LATITUDE', '43.084')),
  sugarbushLongitude: Number(optional('SUGARBUSH_LONGITUDE', '-77.680')),
  openWeatherApiKey: optional('OPENWEATHER_API_KEY') || null,
  // Shared by the Raspberry Pi gateways. Empty disables POST /ingest rather
  // than leaving the route open.
  gatewayIngestToken: optional('GATEWAY_INGEST_TOKEN') || null,
  // Comma-separated. Promoted to Admin on boot so the role is not baked into SQL.
  bootstrapAdminEmails: list('BOOTSTRAP_ADMIN_EMAILS'),
};

export const accessTokenTtlSeconds = config.accessTokenTtlMinutes * 60;
export const refreshTokenTtlSeconds = config.refreshTokenTtlDays * 24 * 60 * 60;
