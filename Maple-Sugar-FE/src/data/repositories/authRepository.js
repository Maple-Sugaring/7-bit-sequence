import { apiClient, setAuthToken } from '../apiClient';
import { clear as clearCache } from '../cache/queryCache';

/** Authentication against the USERS table. */

/**
 * Email/password login. Only the mock transport implements this; the real API
 * has no password column and uses Google instead.
 */
export async function login({ email, password }) {
  const result = await apiClient.post('/auth/login', { email, password });
  setAuthToken(result?.token ?? null);
  return result;
}

export async function logout() {
  await apiClient.post('/auth/logout');
  setAuthToken(null);
  // Everything cached was scoped to the previous user's role.
  clearCache();
}

export async function getSession() {
  const result = await apiClient.get('/auth/session');
  // Re-apply the Bearer token after a refresh. The cookie is what actually
  // authenticates the browser; this keeps non-cookie callers working too.
  setAuthToken(result?.token ?? null);
  return result;
}

/**
 * Mints a new access token from the refresh cookie and returns the session.
 * Used on load when the short access token has lapsed but the refresh token is
 * still good. Throws (401) when there is no valid refresh token.
 */
export async function refresh() {
  const result = await apiClient.post('/auth/refresh');
  setAuthToken(result?.token ?? null);
  return result;
}
