import * as usersRepository from '../data/repositories/usersRepository';
import { capabilitiesFor, expiryStatus, isAccountUsable, roleFromId, ROLE_LABELS } from '../business/permissions';

/**
 * User administration (FR-027, FR-041, FR-056, BRU-003, BRU-004, BRU-005).
 *
 * Admins are the only ones who create accounts, so this is also where the
 * account-lifecycle view comes from.
 */

export async function getUsers() {
  const [users, roles] = await Promise.all([
    usersRepository.listUsers(),
    usersRepository.listRoles(),
  ]);

  const rows = users
    .map((user) => {
      const role = roleFromId(user.RoleID);
      return {
        ...user,
        id: user.UserID,
        fullName: `${user.First_Name} ${user.Last_Name}`.trim() || user.Email,
        role,
        roleLabel: ROLE_LABELS[role] ?? 'Unknown',
        capabilityCount: capabilitiesFor(role).length,
        usable: isAccountUsable(user),
        expiry: expiryStatus(user),
        invitePending: Boolean(user.Invite_Pending),
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return {
    users: rows,
    roles,
    summary: {
      total: rows.length,
      active: rows.filter((user) => user.usable).length,
      locked: rows.filter((user) => !user.usable).length,
      expiringSoon: rows.filter((user) => user.expiry.level === 'warning').length,
      pendingInvites: rows.filter((user) => user.invitePending).length,
      byRole: Object.fromEntries(
        roles.map((role) => [
          role.Role_Name,
          rows.filter((user) => user.RoleID === role.RoleID).length,
        ]),
      ),
    },
  };
}

export function inviteUser({ email, roleId, firstName, lastName, accountExpiry }) {
  return usersRepository.inviteUser({ email, roleId, firstName, lastName, accountExpiry });
}

export function changeRole(userId, roleId) {
  return usersRepository.updateUser(userId, { RoleID: Number(roleId) });
}

export function setActive(userId, isActive) {
  return usersRepository.updateUser(userId, { Is_Active: isActive });
}

/** Sets the exact moment access ends. Null means the account does not expire. */
export function setAccountExpiry(userId, accountExpiry) {
  return usersRepository.updateUser(userId, {
    Account_Expiry: accountExpiry,
    Is_Active: true,
  });
}

export function removeUser(userId) {
  return usersRepository.removeUser(userId);
}
