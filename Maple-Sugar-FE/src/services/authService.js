import * as authRepository from '../data/repositories/authRepository';
import { apiMode } from '../data/apiClient';
import { ApiError } from '../data/ApiError';
import { users as seedUsers } from '../data/fixtures/seed';
import { ROLE_LABELS, isAccountUsable, roleFromId } from '../business/permissions';

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

/**
 * One usable seeded account per role, for signing in without Google while the
 * UI runs on mock data. Empty against the real API.
 */
export function demoAccounts() {
  if (apiMode !== 'mock') return [];

  const byRole = new Map();
  for (const user of seedUsers) {
    const role = roleFromId(user.RoleID);
    if (!byRole.has(role) && isAccountUsable(user)) {
      byRole.set(role, { email: user.Email, label: ROLE_LABELS[role] ?? role });
    }
  }
  return [...byRole.values()];
}

export async function signOut() {
  await authRepository.logout();
}

export async function restoreSession() {
  const result = await authRepository.getSession();
  if (!result?.user || !isAccountUsable(result.user)) return null;
  return { token: result.token, user: toSessionUser(result.user) };
}
