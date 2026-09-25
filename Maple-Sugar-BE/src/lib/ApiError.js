/**
 * Error type whose serialized form matches what the frontend's httpTransport
 * parses: `{ message, code, details }`. The `code` values are the same strings
 * the client already branches on, so a real HTTP failure is indistinguishable
 * from the mock transport's.
 */
export class ApiError extends Error {
  constructor(message, { status = 500, code = 'UNKNOWN', details = null, cause } = {}) {
    super(message, { cause });
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return { message: this.message, code: this.code, details: this.details };
  }
}

export const notFound = (resource) =>
  new ApiError(`${resource} not found.`, { status: 404, code: 'NOT_FOUND' });

export const invalid = (message, details = null) =>
  new ApiError(message, { status: 422, code: 'VALIDATION', details });

export const unauthorized = (message = 'Sign in to continue.') =>
  new ApiError(message, { status: 401, code: 'BAD_CREDENTIALS' });

export const forbidden = (message = 'You do not have access to that.') =>
  new ApiError(message, { status: 403, code: 'FORBIDDEN' });

export const unavailable = (message, code = 'UNAVAILABLE') =>
  new ApiError(message, { status: 503, code });

export const accountExpired = (
  message = 'This account has expired. Ask an administrator to grant an extension.',
) => new ApiError(message, { status: 403, code: 'ACCOUNT_EXPIRED' });
