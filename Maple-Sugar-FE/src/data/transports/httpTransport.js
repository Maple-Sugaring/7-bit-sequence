import { ApiError } from '../ApiError';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

let authToken = null;

export function setAuthToken(token) {
  authToken = token;
}

function buildUrl(path, query) {
  const url = new URL(`${BASE_URL.replace(/\/$/, '')}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

// Single-flight refresh: many requests can 401 at once when the access token
// lapses, but they should share one call to /auth/refresh rather than stampede
// it (which reuse-detection would read as a replay and revoke the session).
let refreshPromise = null;

function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(buildUrl('/auth/refresh'), {
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) return false;
        const data = await response.json().catch(() => null);
        // The cookie is the real credential; mirror the token for Bearer callers.
        authToken = data?.token ?? null;
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function doFetch(path, query, method, body, signal) {
  const timeout = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(8000) : null;
  const combined =
    signal && timeout && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([signal, timeout])
      : (signal ?? timeout ?? undefined);

  return fetch(buildUrl(path, query), {
    method,
    signal: combined,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : null),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : null),
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });
}

export async function request({ method = 'GET', path, query, body, signal }) {
  // /auth/refresh authenticates with the refresh cookie, not the access token,
  // so a 401 from it is terminal — never try to refresh in order to refresh.
  const canRetry = path !== '/auth/refresh';

  let response;
  try {
    response = await doFetch(path, query, method, body, signal);

    if (response.status === 401 && canRetry && (await refreshAccessToken())) {
      response = await doFetch(path, query, method, body, signal);
    }
  } catch (cause) {
    if (cause?.name === 'AbortError') {
      if (signal?.aborted) throw cause;
      throw new ApiError('The API did not respond in time.', { code: 'NETWORK' });
    }
    throw new ApiError('Network request failed.', { code: 'NETWORK' });
  }

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(payload?.message ?? `Request failed with status ${response.status}.`, {
      status: response.status,
      code: payload?.code ?? 'HTTP_ERROR',
      details: payload?.details ?? null,
    });
  }

  return payload;
}
