import dayjs from 'dayjs';
import * as scheduleRepository from '../data/repositories/scheduleRepository';
import * as usersRepository from '../data/repositories/usersRepository';

/**
 * Shift scheduling (FR-020, EIR-003).
 *
 * Students claim open slots; admins have the final say and resolve conflicts.
 * The double-booking guard is enforced here as well as in the API so the UI
 * can disable a button rather than letting a click fail.
 */

/** Shift types and stands an admin can publish against. */
export const SHIFT_TASKS = ['Sap Collection', 'Sensor Calibration', 'Battery Swap', 'Line Cleaning'];
export const STANDS = ['Hill Bottom', 'Rabbi House', 'Sugar Shack', 'North Ridge'];

function overlaps(a, b) {
  return (
    dayjs(a.Starts_At).isBefore(dayjs(b.Ends_At)) && dayjs(a.Ends_At).isAfter(dayjs(b.Starts_At))
  );
}

export async function getSchedule({ from, to, userId } = {}) {
  const [slots, users] = await Promise.all([
    scheduleRepository.listSlots({ from, to }),
    usersRepository.listUsers(),
  ]);

  const userById = new Map(users.map((user) => [user.UserID, user]));
  const mine = userId ? slots.filter((slot) => slot.Assigned_UserIDs.includes(userId)) : [];

  const rows = slots
    .map((slot) => {
      const assigned = slot.Assigned_UserIDs.map((id) => {
        const user = userById.get(id);
        return {
          userId: id,
          name: user ? `${user.First_Name} ${user.Last_Name}`.trim() : `User ${id}`,
          email: user?.Email ?? null,
        };
      });

      const isMine = userId ? slot.Assigned_UserIDs.includes(userId) : false;
      const isPast = dayjs(slot.Ends_At).isBefore(dayjs());
      const remaining = slot.Capacity - slot.Assigned_UserIDs.length;

      // Blocked when the student already holds an overlapping shift, so the
      // signup button is disabled with a reason instead of erroring on click.
      const conflict =
        !isMine && userId ? mine.find((other) => overlaps(other, slot)) ?? null : null;

      return {
        ...slot,
        id: slot.SlotID,
        assigned,
        isMine,
        isPast,
        remaining,
        isFull: remaining <= 0,
        conflictsWith: conflict ? `${conflict.Task} at ${conflict.Stand}` : null,
        canClaim: !isMine && !isPast && remaining > 0 && !conflict,
        day: dayjs(slot.Starts_At).format('YYYY-MM-DD'),
      };
    })
    .sort((a, b) => new Date(a.Starts_At) - new Date(b.Starts_At));

  return {
    slots: rows,
    summary: {
      total: rows.length,
      open: rows.filter((slot) => !slot.isFull && !slot.isPast).length,
      mine: rows.filter((slot) => slot.isMine).length,
      unfilledPast: rows.filter((slot) => slot.isPast && slot.assigned.length === 0).length,
      incomplete: rows.filter((slot) => slot.isPast && slot.assigned.length > 0 && !slot.Is_Complete)
        .length,
    },
  };
}

/** Groups slots into calendar days for the week view. */
export function groupByDay(slots) {
  const days = new Map();
  for (const slot of slots) {
    if (!days.has(slot.day)) days.set(slot.day, []);
    days.get(slot.day).push(slot);
  }
  return [...days.entries()].map(([day, entries]) => ({ day, slots: entries }));
}

export function claimShift(slotId, userId) {
  return scheduleRepository.signUpForSlot(slotId, userId);
}

export function releaseShift(slotId, userId) {
  return scheduleRepository.withdrawFromSlot(slotId, userId);
}

export function createShift(slot) {
  return scheduleRepository.createSlot(slot);
}

export function updateShift(slotId, changes) {
  return scheduleRepository.updateSlot(slotId, changes);
}

export function deleteShift(slotId) {
  return scheduleRepository.deleteSlot(slotId);
}

export function setShiftComplete(slotId, isComplete) {
  return scheduleRepository.updateSlot(slotId, { Is_Complete: isComplete });
}
