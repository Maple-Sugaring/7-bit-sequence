import { queryAll, queryOne } from '../db/pool.js';
import { decryptSecret, encryptSecret } from '../auth/secrets.js';
import { mapRole, mapUser } from './mappers.js';

/**
 * Dates are cast to text in SQL rather than mapped in JS. A bare `date` column
 * comes back from the driver as a Date at local midnight, so a server running
 * west of UTC would report an expiry one day early.
 */
const USER_COLUMNS = `
  id,
  role_id,
  first_name,
  last_name,
  email,
  to_char(created_at, 'YYYY-MM-DD') as created_at,
  last_login,
  is_active,
  account_expiry::text as account_expiry,
  google_calendar_id,
  (google_refresh_token is not null) as calendar_connected,
  invite_pending
`;

export async function listRoles() {
  const rows = await queryAll('select id, role_name from roles order by id');
  return rows.map(mapRole);
}

export async function listUsers() {
  const rows = await queryAll(`
    select ${USER_COLUMNS}
      from users
     order by last_name, first_name
  `);
  return rows.map(mapUser);
}

export async function findUserById(id) {
  const row = await queryOne(`select ${USER_COLUMNS} from users where id = $1`, [id]);
  return row ? mapUser(row) : null;
}

/** Case-insensitive, matching how the invite flow rejects duplicates. */
export async function findUserByEmail(email) {
  const row = await queryOne(`select ${USER_COLUMNS} from users where lower(email) = lower($1)`, [
    email,
  ]);
  return row ? mapUser(row) : null;
}

/** Google's stable subject claim, which is the durable identity key. */
export async function findUserByGoogleSub(googleSub) {
  const row = await queryOne(`select ${USER_COLUMNS} from users where google_sub = $1`, [googleSub]);
  return row ? mapUser(row) : null;
}

export async function createInvite({ email, roleId, firstName, lastName, accountExpiry }) {
  const row = await queryOne(
    `insert into users (role_id, first_name, last_name, email, account_expiry, invite_pending)
     values ($1, $2, $3, $4, $5, true)
     returning ${USER_COLUMNS}`,
    [roleId, firstName, lastName, email, accountExpiry],
  );
  return mapUser(row);
}

/**
 * Links a Google identity to an existing invited account on first sign-in and
 * stamps the login. Clearing invite_pending here is what completes the invite.
 */
export async function linkGoogleIdentity(userId, { googleSub, firstName, lastName }) {
  const row = await queryOne(
    `update users
        set google_sub     = $2,
            -- Only fill names the inviting admin left blank; a person's own
            -- Google profile should not overwrite a deliberate correction.
            first_name     = case when first_name = '' then coalesce($3, '') else first_name end,
            last_name      = case when last_name  = '' then coalesce($4, '') else last_name  end,
            invite_pending = false,
            last_login     = CURRENT_TIMESTAMP
      where id = $1
      returning ${USER_COLUMNS}`,
    [userId, googleSub, firstName, lastName],
  );
  return row ? mapUser(row) : null;
}

export async function touchLastLogin(userId) {
  const row = await queryOne(
    `update users set last_login = CURRENT_TIMESTAMP where id = $1 returning ${USER_COLUMNS}`,
    [userId],
  );
  return row ? mapUser(row) : null;
}

/**
 * Partial update from a PATCH body.
 *
 * Only the fields the admin screens actually change are writable. An explicit
 * allowlist rather than a spread of the request body, so a client cannot patch
 * `google_sub` and hand itself somebody else's identity.
 */
const WRITABLE_USER_COLUMNS = {
  RoleID: 'role_id',
  First_Name: 'first_name',
  Last_Name: 'last_name',
  Email: 'email',
  Is_Active: 'is_active',
  Account_Expiry: 'account_expiry',
  Google_Calendar_ID: 'google_calendar_id',
};

export async function updateUser(id, changes) {
  const assignments = [];
  const values = [id];

  for (const [field, column] of Object.entries(WRITABLE_USER_COLUMNS)) {
    if (field in changes) {
      values.push(changes[field]);
      assignments.push(`${column} = $${values.length}`);
    }
  }

  if (!assignments.length) return findUserById(id);

  const row = await queryOne(
    `update users set ${assignments.join(', ')} where id = $1 returning ${USER_COLUMNS}`,
    values,
  );
  return row ? mapUser(row) : null;
}

export async function deleteUser(id) {
  const row = await queryOne('delete from users where id = $1 returning id', [id]);
  return Boolean(row);
}

export async function saveCalendarConnection(userId, refreshToken) {
  const encrypted = encryptSecret(refreshToken);
  const row = await queryOne(
    `update users
        set google_refresh_token = $2,
            google_calendar_id = coalesce(google_calendar_id, 'primary')
      where id = $1
      returning ${USER_COLUMNS}`,
    [userId, encrypted],
  );
  return row ? mapUser(row) : null;
}

export async function getGoogleRefreshToken(userId) {
  const row = await queryOne('select google_refresh_token from users where id = $1', [userId]);
  return decryptSecret(row?.google_refresh_token ?? null);
}

export async function clearCalendarConnection(userId) {
  const row = await queryOne(
    `update users
        set google_refresh_token = null
      where id = $1
      returning ${USER_COLUMNS}`,
    [userId],
  );
  return row ? mapUser(row) : null;
}
