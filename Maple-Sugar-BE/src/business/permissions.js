/**
 * Role-based access control, mirroring src/business/permissions.js in the
 * frontend.
 *
 * The client copy decides which menu items and buttons appear. This copy is
 * the actual control: it runs on every mutating request, so hiding a button is
 * never what stops an unauthorized write.
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
 * Account lifecycle. An expired or deactivated account is locked out even
 * though its role would otherwise grant access, which is how a student's
 * access lapses at the end of a term without anyone editing roles.
 */
export function isAccountUsable(user, now = new Date()) {
  if (!user) return false;
  if (!user.Is_Active) return false;
  if (!user.Account_Expiry) return true;
  return new Date(user.Account_Expiry) >= now;
}
