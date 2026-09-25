/**
 * Terminal error middleware.
 *
 * Serializes every failure as `{ message, code, details }`, which is the shape
 * the frontend's httpTransport parses to build an ApiError. Matching it means a
 * real backend failure produces the same client-side error object the mock
 * transport does, so error handling in the UI needs no special cases.
 */

import { ZodError } from 'zod';
import { ApiError } from '../lib/ApiError.js';
import { logger } from '../lib/logger.js';

/** Postgres error codes worth translating into something a user can act on. */
const PG_ERROR_MAP = {
  // unique_violation
  23505: { status: 422, code: 'VALIDATION', message: 'That record already exists.' },
  // foreign_key_violation
  23503: { status: 422, code: 'VALIDATION', message: 'That references a record which does not exist.' },
  // check_violation
  23514: { status: 422, code: 'VALIDATION', message: 'That value is outside the allowed range.' },
  // not_null_violation
  23502: { status: 422, code: 'VALIDATION', message: 'A required field was missing.' },
};

/** Flattens a Zod error into the field-keyed map the client attaches to inputs. */
function zodDetails(error) {
  const details = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!details[key]) details[key] = issue.message;
  }
  return details;
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    message: `No route for ${req.method} ${req.path}.`,
    code: 'NOT_FOUND',
    details: null,
  });
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
export function errorHandler(error, req, res, next) {
  if (error instanceof ApiError) {
    // 5xx is our bug; 4xx is the caller's and would only be log noise.
    if (error.status >= 500) {
      logger.error({ err: error, path: req.path }, 'Request failed');
    } else {
      logger.debug({ code: error.code, path: req.path }, error.message);
    }
    return res.status(error.status).json(error.toJSON());
  }

  if (error instanceof ZodError) {
    return res.status(422).json({
      message: 'Some fields need attention.',
      code: 'VALIDATION',
      details: zodDetails(error),
    });
  }

  const pgMapping = error?.code && PG_ERROR_MAP[error.code];
  if (pgMapping) {
    logger.warn({ err: error, path: req.path }, 'Database constraint rejected a write');
    return res.status(pgMapping.status).json({
      message: pgMapping.message,
      code: pgMapping.code,
      details: null,
    });
  }

  // Anything unrecognized is a bug. Log it in full, but never leak an internal
  // message or stack to the client.
  logger.error({ err: error, path: req.path }, 'Unhandled error');
  res.status(500).json({
    message: 'Something went wrong on our end.',
    code: 'INTERNAL',
    details: null,
  });
}
