import { queryAll, queryOne, transaction } from '../db/pool.js';
import { invalid, notFound } from '../lib/ApiError.js';
import { mapScheduleSlot } from './mappers.js';

/**
 * Assignments are aggregated into the array the UI expects. filter is needed
 * because a LEFT JOIN with no assignments aggregates to `{NULL}` rather than an
 * empty array, which would render as one phantom signup on every open shift.
 */
const SLOT_SELECT = `
  select s.id,
         s.task,
         s.stand,
         s.starts_at,
         s.ends_at,
         s.capacity,
         s.is_complete,
         s.alert_id,
         s.node_id,
         s.notes,
         s.bucket_ids,
         coalesce(
           (
             select jsonb_agg(b.barcode_id order by b.id)
               from buckets b
              where b.id = any (s.bucket_ids)
           ),
           '[]'::jsonb
         ) as bucket_labels,
         coalesce(
           array_agg(a.user_id order by a.assigned_at)
             filter (where a.user_id is not null),
           '{}'
         ) as assigned_user_ids,
         -- Assignee display names travel with the slot so the schedule view
         -- does not have to fetch the admin-only user roster just to label a
         -- shift. Only id/name/email are exposed, never role or account state.
         coalesce(
           jsonb_agg(
             jsonb_build_object('userId', a.user_id, 'name', u.full_name, 'email', u.email)
             order by a.assigned_at
           ) filter (where a.user_id is not null),
           '[]'::jsonb
         ) as assignees
    from schedule_slots s
    left join schedule_assignments a on a.slot_id = s.id
    left join users u on u.id = a.user_id
`;

const SLOT_GROUP_BY = 'group by s.id';

export async function listSlots({ from, to } = {}) {
  const conditions = [];
  const values = [];

  // Bounded on starts_at only, matching the mock: a shift belongs to the day it
  // begins on even if it runs past midnight.
  if (from) {
    values.push(from);
    conditions.push(`(s.starts_at is null or s.starts_at >= $${values.length})`);
  }
  if (to) {
    values.push(to);
    conditions.push(`s.starts_at <= $${values.length}`);
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';

  const rows = await queryAll(
    `${SLOT_SELECT} ${where} ${SLOT_GROUP_BY} order by s.starts_at nulls first, s.id`,
    values,
  );
  return rows.map(mapScheduleSlot);
}

export async function findSlotById(id, client = null) {
  const sql = `${SLOT_SELECT} where s.id = $1 ${SLOT_GROUP_BY}`;
  const row = client ? (await client.query(sql, [id])).rows[0] ?? null : await queryOne(sql, [id]);
  return row ? mapScheduleSlot(row) : null;
}

export async function createSlot({
  Task,
  Stand,
  Starts_At = null,
  Ends_At = null,
  Capacity = 1,
  Alert_ID = null,
  Node_ID = null,
  Notes = '',
  Bucket_IDs = [],
}) {
  const row = await queryOne(
    `insert into schedule_slots
       (task, stand, starts_at, ends_at, capacity, alert_id, node_id, notes, bucket_ids)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning id`,
    [Task, Stand, Starts_At, Ends_At, Capacity, Alert_ID, Node_ID, Notes, Bucket_IDs],
  );
  return findSlotById(row.id);
}

export async function findOpenTaskForAlert(alertId) {
  const row = await queryOne(
    `select id from schedule_slots
      where alert_id = $1 and is_complete = false
      limit 1`,
    [alertId],
  );
  return row ? findSlotById(row.id) : null;
}

const WRITABLE_SLOT_COLUMNS = {
  Task: 'task',
  Stand: 'stand',
  Starts_At: 'starts_at',
  Ends_At: 'ends_at',
  Capacity: 'capacity',
  Is_Complete: 'is_complete',
};

export async function updateSlot(id, changes) {
  const assignments = [];
  const values = [id];

  for (const [field, column] of Object.entries(WRITABLE_SLOT_COLUMNS)) {
    if (field in changes) {
      values.push(changes[field]);
      assignments.push(`${column} = $${values.length}`);
    }
  }

  if (!assignments.length) return findSlotById(id);

  const row = await queryOne(
    `update schedule_slots set ${assignments.join(', ')} where id = $1 returning id`,
    values,
  );
  return row ? findSlotById(row.id) : null;
}

export async function deleteSlot(id) {
  // schedule_assignments cascades, so signups go with the shift.
  const row = await queryOne('delete from schedule_slots where id = $1 returning id', [id]);
  return Boolean(row);
}

/**
 * Claims a shift for a user.
 *
 * The whole check-then-insert runs in one transaction with the slot row locked.
 * Without the lock, two students loading the schedule and clicking sign up at
 * the same moment would both read capacity as available and both insert,
 * overfilling the shift. The signup rules are enforced here rather than in a
 * service because they are only sound while that lock is held.
 */
export async function signUp(slotId, userId) {
  return transaction(async (client) => {
    const { rows } = await client.query(
      'select id, task, stand, starts_at, ends_at, capacity from schedule_slots where id = $1 for update',
      [slotId],
    );
    const slot = rows[0];
    if (!slot) throw notFound('Shift');
    if (!slot.starts_at || !slot.ends_at) {
      throw invalid('Pick a time on your calendar before claiming this collection.');
    }

    const { rows: existing } = await client.query(
      'select user_id from schedule_assignments where slot_id = $1',
      [slotId],
    );

    if (existing.some((row) => row.user_id === userId)) {
      throw invalid('You are already signed up for this shift.');
    }

    if (existing.length >= slot.capacity) {
      throw invalid('This shift is already full.');
    }

    // A student cannot be in two places at once, even at different stands.
    const { rows: clashes } = await client.query(
      `select s.task, s.stand
         from schedule_assignments a
         join schedule_slots s on s.id = a.slot_id
        where a.user_id = $1
          and s.id <> $2
          and s.starts_at is not null
          and tstzrange(s.starts_at, s.ends_at) && tstzrange($3, $4)
        limit 1`,
      [userId, slotId, slot.starts_at, slot.ends_at],
    );

    if (clashes.length) {
      throw invalid(`That overlaps your ${clashes[0].task} shift at ${clashes[0].stand}.`);
    }

    await client.query(
      'insert into schedule_assignments (slot_id, user_id) values ($1, $2)',
      [slotId, userId],
    );

    return findSlotById(slotId, client);
  });
}

/**
 * Volunteer chose a free window. The slot row stays locked until the assignment
 * is written so two people cannot take the same open task.
 */
export async function claimTime(slotId, userId, startsAt, endsAt) {
  return transaction(async (client) => {
    const { rows } = await client.query(
      `select id, starts_at, ends_at, capacity, is_complete
         from schedule_slots
        where id = $1
        for update`,
      [slotId],
    );
    const slot = rows[0];
    if (!slot) throw notFound('Shift');
    if (slot.is_complete) throw invalid('This collection is already complete.');
    if (slot.starts_at) throw invalid('Someone already chose a time for this collection.');

    const { rows: existing } = await client.query(
      'select user_id from schedule_assignments where slot_id = $1',
      [slotId],
    );
    if (existing.some((row) => row.user_id === userId)) {
      throw invalid('You are already signed up for this shift.');
    }
    if (existing.length >= slot.capacity) throw invalid('This shift is already full.');

    const { rows: clashes } = await client.query(
      `select s.task, s.stand
         from schedule_assignments a
         join schedule_slots s on s.id = a.slot_id
        where a.user_id = $1
          and s.starts_at is not null
          and tstzrange(s.starts_at, s.ends_at) && tstzrange($2, $3)
        limit 1`,
      [userId, startsAt, endsAt],
    );
    if (clashes.length) {
      throw invalid(`That overlaps your ${clashes[0].task} shift at ${clashes[0].stand}.`);
    }

    await client.query('update schedule_slots set starts_at = $2, ends_at = $3 where id = $1', [
      slotId,
      startsAt,
      endsAt,
    ]);
    await client.query('insert into schedule_assignments (slot_id, user_id) values ($1, $2)', [
      slotId,
      userId,
    ]);

    return findSlotById(slotId, client);
  });
}

export async function withdraw(slotId, userId) {
  const slot = await findSlotById(slotId);
  if (!slot) throw notFound('Shift');

  const assignment = await queryOne(
    'delete from schedule_assignments where slot_id = $1 and user_id = $2 returning google_event_id',
    [slotId, userId],
  );

  return { slot: await findSlotById(slotId), googleEventId: assignment?.google_event_id ?? null };
}

export async function setAssignmentEventId(slotId, userId, eventId) {
  await queryOne(
    `update schedule_assignments
        set google_event_id = $3
      where slot_id = $1 and user_id = $2
      returning slot_id`,
    [slotId, userId, eventId],
  );
}

export async function listAssignments(slotId) {
  const rows = await queryAll(
    'select user_id, google_event_id from schedule_assignments where slot_id = $1',
    [slotId],
  );
  return rows.map((row) => ({ userId: row.user_id, googleEventId: row.google_event_id ?? null }));
}

export async function listUpcomingSlotsForUser(userId) {
  const rows = await queryAll(
    `${SLOT_SELECT}
      where a.user_id = $1
        and s.ends_at > CURRENT_TIMESTAMP
      ${SLOT_GROUP_BY}
      order by s.starts_at, s.id`,
    [userId],
  );
  return rows.map(mapScheduleSlot);
}
