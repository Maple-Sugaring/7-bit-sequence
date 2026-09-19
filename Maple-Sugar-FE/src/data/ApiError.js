/**
 * Normalized failure shape. Both transports throw this, so the service layer
 * never has to tell a network failure apart from a mock validation failure.
 */
export class ApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isNotFound() {
    return this.status === 404;
  }

  get isValidation() {
    return this.status === 422;
  }

  get isOffline() {
    return this.code === 'NETWORK';
  }
}

/** Message safe to render directly in a Snackbar or Alert. */
export function toUserMessage(error) {
  if (!(error instanceof ApiError)) {
    return 'Something went wrong. Please try again.';
  }
  if (error.isOffline) {
    return 'Cannot reach the server. Readings will sync once the connection returns.';
  }
  if (error.isUnauthorized) {
    return 'Your session has expired. Please sign in again.';
  }
  if (error.isForbidden) {
    return 'Your role does not have access to that.';
  }
  return error.message;
}
