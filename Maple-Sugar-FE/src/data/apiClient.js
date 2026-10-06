import * as httpTransport from './transports/httpTransport';
import * as hybridTransport from './transports/hybridTransport';
import * as mockTransport from './transports/mockTransport';

/**
 * Single seam between the app and the network. Repositories import only this;
 * nothing above the data layer knows whether the data came from the Express
 * API or the in-memory mock.
 */

const mode = import.meta.env.VITE_API_MODE ?? 'mock';
// `hybrid` keeps sensor data mock but sends calendar, email and schedule to the real API.
const transport = { http: httpTransport, hybrid: hybridTransport }[mode] ?? mockTransport;

export const apiMode = mode;

export function setAuthToken(token) {
  transport.setAuthToken(token);
}

export const apiClient = {
  get: (path, query, options) => transport.request({ method: 'GET', path, query, ...options }),
  post: (path, body, options) => transport.request({ method: 'POST', path, body, ...options }),
  patch: (path, body, options) => transport.request({ method: 'PATCH', path, body, ...options }),
  delete: (path, options) => transport.request({ method: 'DELETE', path, ...options }),
};
