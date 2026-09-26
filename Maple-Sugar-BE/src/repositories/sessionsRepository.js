/**
 * Persistence for refresh-token sessions.
 *
 * The service layer owns the rotation and reuse-detection logic; this file is
 * only the SQL. Rotation runs inside a single transaction so a token is never
 * both spendable and already replaced.
 */

import { query, queryOne, transaction } from '../db/pool.js';

const SESSION_COLUMNS = `
  id,
  user_id,
  family_id,
  token_hash,
  user_agent,
  created_ip,
  issued_at,
  last_used_at,
  expires_at,
  revoked_at,
  replaced_by
`;

export async function createSession({ userId, familyId, tokenHash, expiresAt, userAgent, ip }) {
  return queryOne(
    `insert into sessions (user_id, family_id, token_hash, expires_at, user_agent, created_ip)
     values ($1, $2, $3, $4, $5, $6)
     returning ${SESSION_COLUMNS}`,
    [userId, familyId, tokenHash, expiresAt, userAgent ?? null, ip ?? null],
  );
}

export async function findByTokenHash(tokenHash) {
  return queryOne(`select ${SESSION_COLUMNS} from sessions where token_hash = $1`, [tokenHash]);
}

/**
 * Atomically spends `oldId` and issues its successor in the same family.
 * Returns the new row.
 */
export async function rotate({ oldId, userId, familyId, tokenHash, expiresAt, userAgent, ip }) {
  return transaction(async (client) => {
    const { rows } = await client.query(
      `insert into sessions (user_id, family_id, token_hash, expires_at, user_agent, created_ip)
       values ($1, $2, $3, $4, $5, $6)
       returning ${SESSION_COLUMNS}`,
      [userId, familyId, tokenHash, expiresAt, userAgent ?? null, ip ?? null],
    );
    const next = rows[0];
    await client.query(
      `update sessions
          set revoked_at = CURRENT_TIMESTAMP,
              replaced_by = $2,
              last_used_at = CURRENT_TIMESTAMP
        where id = $1`,
      [oldId, next.id],
    );
    return next;
  });
}

/** Revokes a single live token, e.g. on logout. */
export async function revokeByTokenHash(tokenHash) {
  const row = await queryOne(
    `update sessions
        set revoked_at = CURRENT_TIMESTAMP
      where token_hash = $1 and revoked_at is null
      returning id`,
    [tokenHash],
  );
  return Boolean(row);
}

/** Revokes an entire lineage, used when a spent token is replayed. */
export async function revokeFamily(familyId) {
  const result = await query(
    `update sessions
        set revoked_at = CURRENT_TIMESTAMP
      where family_id = $1 and revoked_at is null`,
    [familyId],
  );
  return result.rowCount ?? 0;
}

/** "Log out everywhere" for one user. */
export async function revokeAllForUser(userId) {
  const result = await query(
    `update sessions
        set revoked_at = CURRENT_TIMESTAMP
      where user_id = $1 and revoked_at is null`,
    [userId],
  );
  return result.rowCount ?? 0;
}

/** Housekeeping: drop rows that expired or were revoked a while ago. */
export async function deleteExpired() {
  const result = await query(
    `delete from sessions
      where expires_at < CURRENT_TIMESTAMP
         or revoked_at < CURRENT_TIMESTAMP - interval '30 days'`,
  );
  return result.rowCount ?? 0;
}
