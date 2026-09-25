/**
 * Role-based access control (FR-010, BRU-004, BRU-005).
 *
 * Single source of truth for what each role may do. Route guards and
 * conditional UI both read from here so a menu item can never appear for a
 * role that the router would reject.
 */

export const Role = {
  ADMIN: 'Admin',
  STUDENT: 'Student',
  MSS: 'MSS',
};

export const ROLE_BY_ID = {
  1: Role.ADMIN,
  2: Role.STUDENT,
  3: Role.MSS,
};

export const ROLE_LABELS = {
  [Role.ADMIN]: 'Administrator',
  [Role.STUDENT]: 'Student',
  [Role.MSS]: 'MSS Member',
};

export const Capability = {
  VIEW_DASHBOARD: 'view_dashboard',
  VIEW_DATA_TABLE: 'view_data_table',
  EXPORT_DATA: 'export_data',
  RECORD_DATA: 'record_data',
  EDIT_DATA: 'edit_data',
  VIEW_ALERTS: 'view_alerts',
  RESOLVE_ALERTS: 'resolve_alerts',
  VIEW_SCHEDULE: 'view_schedule',
  CLAIM_SHIFT: 'claim_shift',
  MANAGE_SCHEDULE: 'manage_schedule',
  VIEW_NODES: 'view_nodes',
  FLAG_NODE: 'flag_node',
  MANAGE_USERS: 'manage_users',
  VIEW_GUIDES: 'view_guides',
};

/**
 * Per the business rules: admins run the class, students collect and record,
 * MSS members review and export for outreach.
 */
const CAPABILITIES_BY_ROLE = {
  [Role.ADMIN]: Object.values(Capability),
  [Role.STUDENT]: [
    Capability.VIEW_DASHBOARD,
    Capability.VIEW_DATA_TABLE,
    Capability.EXPORT_DATA,
    Capability.RECORD_DATA,
    Capability.VIEW_ALERTS,
    Capability.RESOLVE_ALERTS,
    Capability.VIEW_SCHEDULE,
    Capability.CLAIM_SHIFT,
    Capability.VIEW_NODES,
    Capability.FLAG_NODE,
    Capability.VIEW_GUIDES,
  ],
  [Role.MSS]: [
    Capability.VIEW_DASHBOARD,
    Capability.VIEW_DATA_TABLE,
    Capability.EXPORT_DATA,
    Capability.VIEW_GUIDES,
  ],
};

export function roleFromId(roleId) {
  return ROLE_BY_ID[roleId] ?? null;
}

export function capabilitiesFor(role) {
  return CAPABILITIES_BY_ROLE[role] ?? [];
}

export function can(role, capability) {
  return capabilitiesFor(role).includes(capability);
}

export function canAll(role, capabilities) {
  return capabilities.every((capability) => can(role, capability));
}

/**
 * Account lifecycle (BRU-003, FR-040). An expired account is locked out even
 * if its role would otherwise grant access.
 */
export function isAccountUsable(user, now = new Date()) {
  if (!user) return false;
  if (!user.Is_Active) return false;
  if (!user.Account_Expiry) return true;
  return new Date(user.Account_Expiry) >= now;
}

export function daysUntilExpiry(user, now = new Date()) {
  if (!user?.Account_Expiry) return null;
  return Math.ceil((new Date(user.Account_Expiry) - now) / 86_400_000);
}

export function expiryStatus(user, now = new Date()) {
  if (!user?.Is_Active) return { level: 'error', label: 'Locked' };

  const days = daysUntilExpiry(user, now);
  if (days == null) return { level: 'success', label: 'No expiry' };
  if (days < 0) return { level: 'error', label: 'Expired' };
  if (days <= 14) return { level: 'warning', label: `Expires in ${days}d` };
  return { level: 'success', label: `Expires in ${days}d` };
}
