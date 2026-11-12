/**
 * Stamps every request with its receipt time and a correlation id (FR-036).
 *
 * Runs first, so `req.receivedAt` is as close to arrival as Express allows and
 * the same id appears in the log line, the X-Request-Id response header, and
 * every activity event and reading the request writes. A well-formed id from the
 * caller (the gateway, nginx) is kept so one trace spans both sides.
 */

import { randomUUID } from 'node:crypto';
import { acceptRequestId } from '../business/activity.js';

export function requestContext(req, res, next) {
  req.receivedAt = new Date();
  req.id = acceptRequestId(req.get?.('x-request-id') ?? req.headers?.['x-request-id']) ?? randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
