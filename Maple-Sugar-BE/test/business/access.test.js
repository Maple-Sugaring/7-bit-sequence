import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  Capability,
  Role,
  can,
  canAll,
  capabilitiesFor,
  isAccountUsable,
  roleFromId,
} from '../../src/business/permissions.js';

describe('role capabilities', () => {
  test('maps the three stored role ids and nothing else', () => {
    assert.equal(roleFromId(1), Role.ADMIN);
    assert.equal(roleFromId(2), Role.STUDENT);
    assert.equal(roleFromId(3), Role.MSS);
    assert.equal(roleFromId(9), null);
    assert.deepEqual(capabilitiesFor('Visitor'), []);
  });

  test('admins can do every action', () => {
    assert.equal(canAll(Role.ADMIN, Object.values(Capability)), true);
  });

  test('students record and collect, and cannot administer the class', () => {
    assert.equal(can(Role.STUDENT, Capability.RECORD_DATA), true);
    assert.equal(can(Role.STUDENT, Capability.CLAIM_SHIFT), true);
    assert.equal(can(Role.STUDENT, Capability.RESOLVE_ALERTS), true);
    assert.equal(can(Role.STUDENT, Capability.EDIT_DATA), false);
    assert.equal(can(Role.STUDENT, Capability.MANAGE_USERS), false);
    assert.equal(can(Role.STUDENT, Capability.MANAGE_SCHEDULE), false);
  });

  test('MSS members review and export, and cannot record or manage', () => {
    assert.equal(can(Role.MSS, Capability.VIEW_DASHBOARD), true);
    assert.equal(can(Role.MSS, Capability.EXPORT_DATA), true);
    assert.equal(can(Role.MSS, Capability.RECORD_DATA), false);
    assert.equal(can(Role.MSS, Capability.VIEW_ALERTS), false);
    assert.equal(can(Role.MSS, Capability.VIEW_SCHEDULE), false);
    assert.equal(can(Role.MSS, Capability.MANAGE_USERS), false);
  });
});

describe('account lifecycle', () => {
  const now = new Date('2026-03-10T15:00:00.000Z');

  test('a missing, inactive, or expired account is locked', () => {
    assert.equal(isAccountUsable(null, now), false);
    assert.equal(isAccountUsable({ Is_Active: false, Account_Expiry: null }, now), false);
    assert.equal(
      isAccountUsable({ Is_Active: true, Account_Expiry: '2026-03-01T00:00:00.000Z' }, now),
      false,
    );
  });

  test('an active account with no expiry, or an expiry still ahead, is usable', () => {
    assert.equal(isAccountUsable({ Is_Active: true, Account_Expiry: null }, now), true);
    assert.equal(
      isAccountUsable({ Is_Active: true, Account_Expiry: '2026-05-01T00:00:00.000Z' }, now),
      true,
    );
  });
});
