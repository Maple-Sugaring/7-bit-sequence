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
         coalesce(
           array_agg(a.user_id order by a.assigned_at)
             filter (where a.user_id is not null),
           '{}'
         ) as assigned_user_ids
    from schedule_slots s
    left join schedule_assignments a on a.slot_id = s.id
`;

const SLOT_GROUP_BY = 'group by s.id';

export async function listSlots({ from, to } = {}) {
  const conditions = [];
  const values = [];

  // Bounded on starts_at only, matching the mock: a shift belongs to the day it
  // begins on even if it runs past midnight.
  if (from) {
    values.push(from);
    conditions.push(`s.starts_at >= $${values.length}`);
  }
  if (to) {
    values.push(to);
    conditions.push(`s.starts_at <= $${values.length}`);
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';

  const rows = await queryAll(
    `${SLOT_SELECT} ${where} ${SLOT_GROUP_BY} order by s.starts_at, s.id`,
    values,
  );
  return rows.map(mapScheduleSlot);
}

export async function findSlotById(id, client = null) {
  const sql = `${SLOT_SELECT} where s.id = $1 ${SLOT_GROUP_BY}`;
  const row = client ? (await client.query(sql, [id])).rows[0] ?? null : await queryOne(sql, [id]);
  return row ? mapScheduleSlot(row) : null;
}

export async function createSlot({ Task, Stand, Starts_At, Ends_At, Capacity = 2 }) {
  const row = await queryOne(
    `insert into schedule_slots (task, stand, starts_at, ends_at, capacity)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [Task, Stand, Starts_At, Ends_At, Capacity],
  );
  return findSlotById(row.id);
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
