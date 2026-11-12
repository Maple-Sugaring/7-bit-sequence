/**
 * Turns raw audit_events rows into what the admin audit table shows: a
 * readable event name, who did it, what it was done to, and the note without
 * the demo-fixture prefix.
 */

const TEST_PREFIX = /^\[Test sample\]\s*/;

export const AUDIT_EVENTS = {
  node_setup: { label: 'Node set up', target: 'Node', tone: 'success' },
  tap_setup: { label: 'Tap set up', target: 'Node', tone: 'success' },
  tap_removed: { label: 'Tap removed', target: 'Node', tone: 'warning' },
  collection_created: { label: 'Collection', target: 'Collection', tone: 'info' },
  measurement_overwritten: { label: 'Reading corrected', target: 'Reading', tone: 'warning' },
  user_created: { label: 'User invited', target: 'User', tone: 'success' },
  user_deleted: { label: 'User deleted', target: 'User', tone: 'error' },
};

function titleCase(value) {
  return String(value ?? 'event')
    .split('_')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function personName(user) {
  if (!user) return null;
  const name = `${user.First_Name ?? ''} ${user.Last_Name ?? ''}`.trim();
  return name || user.Email || null;
}

/** `usersById` is optional; without it an actor shows as "User 10". */
export function describeAuditEvent(event, usersById = new Map()) {
  const meta = AUDIT_EVENTS[event.event_type] ?? { label: titleCase(event.event_type), target: 'Item', tone: 'default' };
  const note = String(event.note ?? '');
  const isTest = TEST_PREFIX.test(note);
  const actor = event.actor_id == null ? null : usersById.get(event.actor_id);
  const targetName = meta.target === 'User' ? personName(usersById.get(event.target_id)) : null;

  return {
    id: event.id,
    at: event.created_at,
    label: meta.label,
    tone: meta.tone,
    actor: event.actor_id == null ? 'System' : personName(actor) ?? `User ${event.actor_id}`,
    isSystem: event.actor_id == null,
    target: targetName ? `${targetName} (#${event.target_id})` : `${meta.target} #${event.target_id}`,
    note: note.replace(TEST_PREFIX, ''),
    isTest,
  };
}
