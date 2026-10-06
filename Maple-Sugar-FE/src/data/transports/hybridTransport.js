import * as httpTransport from './httpTransport';
import * as mockTransport from './mockTransport';

/**
 * Demo mode that keeps the sensor-side screens on the seeded mock data but
 * sends everything that touches a person to the real API: Google sign-in,
 * profile and email preferences, test email, and the schedule (shift signups
 * create real Google Calendar events and send real emails).
 *
 * Calendar needs a real Google refresh token and email needs the server-side
 * Brevo key, so neither can be faked from the browser. The real session is
 * mirrored into the mock so journal entries and readings carry its author.
 */
const REAL_PATHS = [
  /^\/auth(\/|$)/,
  /^\/profile$/,
  /^\/notifications(\/|$)/,
  /^\/schedule(\/|$)/,
  /^\/users(\/|$)/,
  /^\/roles$/,
];

export async function request(call) {
  if (!REAL_PATHS.some((pattern) => pattern.test(call.path))) {
    return mockTransport.request(call);
  }

  const result = await httpTransport.request(call);

  if (call.method === 'GET' && call.path === '/auth/session' && result?.user) {
    mockTransport.adoptUser(result.user);
  }
  if (call.method === 'POST' && call.path === '/auth/logout') mockTransport.forgetUser();

  return result;
}

export function setAuthToken(token) {
  httpTransport.setAuthToken(token);
}
