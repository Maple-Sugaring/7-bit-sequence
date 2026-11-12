import { describe, expect, test } from 'vitest';
import { describeAuditEvent } from '../src/business/auditEvents';

const users = new Map([
  [10, { UserID: 10, First_Name: 'Tom', Last_Name: 'Palmer', Email: 'tp@rit.edu' }],
  [12, { UserID: 12, First_Name: '', Last_Name: '', Email: 'new@rit.edu' }],
]);

describe('audit event formatting', () => {
  test('names the event, the person, and the node it touched', () => {
    const row = describeAuditEvent(
      { id: 1, event_type: 'tap_removed', actor_id: 10, target_id: 17, note: 'Tap pulled for the semester.', created_at: '2026-11-12T17:42:02Z' },
      users,
    );
    expect(row).toMatchObject({ label: 'Tap removed', tone: 'warning', actor: 'Tom Palmer', target: 'Node #17', isTest: false, isSystem: false });
  });

  test('strips the test-sample prefix into a flag and shows system actions', () => {
    const row = describeAuditEvent({ id: 2, event_type: 'collection_created', actor_id: null, target_id: 271, note: '[Test sample] Test collection round 1 · bucket collected.' });
    expect(row).toMatchObject({ actor: 'System', isSystem: true, isTest: true, target: 'Collection #271', note: 'Test collection round 1 · bucket collected.' });
  });

  test('a user target shows their name, falling back to email', () => {
    expect(describeAuditEvent({ id: 3, event_type: 'user_created', actor_id: 10, target_id: 12, note: '' }, users).target).toBe('new@rit.edu (#12)');
  });

  test('an unknown actor or event type still reads sensibly', () => {
    const row = describeAuditEvent({ id: 4, event_type: 'gateway_moved', actor_id: 99, target_id: 3, note: null });
    expect(row).toMatchObject({ label: 'Gateway Moved', actor: 'User 99', target: 'Item #3', note: '', tone: 'default' });
  });
});
