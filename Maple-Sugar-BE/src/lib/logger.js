import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.logLevel,
  // Secrets and session material must never reach the log stream, including
  // when a request is logged wholesale on error.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-gateway-token"]',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'token',
      'client_secret',
      'id_token',
      'refresh_token',
      'google_refresh_token',
    ],
    censor: '[redacted]',
  },
});
