import { query } from '../db/pool.js';

/**
 * Writes one row to the admin audit history (GET /audit-events).
 *
 * Pass the transaction client of the change being recorded, so the change and
 * its audit row commit or roll back together. Demo-node events are flagged by
 * the audit_events_classify_demo trigger, so callers need not set demo_fixture.
 */
export async function recordAudit(client, { eventType, actorId = null, targetId = null, note = null }) {
  await (client ?? { query }).query(
    'insert into audit_events (event_type, actor_id, target_id, note) values ($1, $2, $3, $4)',
    [eventType, actorId, targetId, note],
  );
}
