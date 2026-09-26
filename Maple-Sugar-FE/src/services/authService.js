import * as authRepository from '../data/repositories/authRepository';
import { apiMode } from '../data/apiClient';
import { ApiError } from '../data/ApiError';
import { isAccountUsable, roleFromId } from '../business/permissions';

/**
 * Authentication orchestration: talks to the repository, then applies the
 * account-lifecycle rule before handing a session to the UI.
 */

function toSessionUser(user) {
  return {
    id: user.UserID,
    firstName: user.First_Name,
    lastName: user.Last_Name,
    fullName: `${user.First_Name} ${user.Last_Name}`.trim(),
    email: user.Email,
    role: roleFromId(user.RoleID),
    accountExpiry: user.Account_Expiry,
    isActive: user.Is_Active,
    calendarConnected: Boolean(user.Calendar_Connected),
  };
}

export async function signIn({ email, password }) {
  const result = await authRepository.login({ email, password });

  if (!result?.user) {
    throw new ApiError('Sign in failed.', { status: 401, code: 'BAD_CREDENTIALS' });
  }

  // BRU-003: an expired account is refused even with correct credentials.
  if (!isAccountUsable(result.user)) {
    await authRepository.logout().catch(() => {});
    throw new ApiError(
      'This account has expired. Ask an administrator to grant an extension.',
      { status: 403, code: 'ACCOUNT_EXPIRED' },
    );
  }

  return { token: result.token, user: toSessionUser(result.user) };
}

export async function signOut() {
  await authRepository.logout();
}

export async function restoreSession() {
  let result = await authRepository.getSession();

  // The access token is short-lived, so on a fresh load it may already have
  // lapsed while the refresh token is still valid. Trade the refresh cookie for
  // a new session before concluding the user is signed out. Mock mode has no
  // refresh endpoint, so it is skipped there.
  if (!result?.user && apiMode === 'http') {
    result = await authRepository.refresh().catch(() => null);
  }

  if (!result?.user || !isAccountUsable(result.user)) return null;
  return { token: result.token, user: toSessionUser(result.user) };
}
