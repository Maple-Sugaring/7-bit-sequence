import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';

import '../env.js';
import { Capability, Role } from '../../src/business/permissions.js';
import { closePool } from '../../src/db/pool.js';
import { ApiError } from '../../src/lib/ApiError.js';
import {
  requireAnyCapability,
  requireAuth,
  requireCapability,
  requireSelfOrCapability,
} from '../../src/middleware/authenticate.js';

function gate(middleware, req) {
  return new Promise((resolve) => {
    middleware(req, {}, (error) => resolve(error ?? null));
  });
}

after(() => closePool());

const admin = { user: { UserID: 1, RoleID: 1 }, role: Role.ADMIN };
const student = { user: { UserID: 5, RoleID: 2 }, role: Role.STUDENT };
const mss = { user: { UserID: 8, RoleID: 3 }, role: Role.MSS };

describe('authentication gate', () => {
  test('blocks a request with no session', async () => {
    const error = await gate(requireAuth, {});
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 401);
    assert.equal(error.code, 'BAD_CREDENTIALS');
  });

  test('lets a resolved session through', async () => {
    assert.equal(await gate(requireAuth, student), null);
  });
});

describe('capability gate', () => {
  test('students cannot manage users or edit recorded readings', async () => {
    const users = await gate(requireCapability(Capability.MANAGE_USERS), student);
    const edits = await gate(requireCapability(Capability.EDIT_DATA), student);
    assert.equal(users.status, 403);
    assert.equal(users.code, 'FORBIDDEN');
    assert.equal(edits.status, 403);
  });

  test('MSS members can open the dashboard and cannot open the schedule', async () => {
    const dashboard = await gate(
      requireAnyCapability(Capability.VIEW_DASHBOARD, Capability.VIEW_NODES),
      mss,
    );
    const schedule = await gate(requireCapability(Capability.VIEW_SCHEDULE), mss);
    assert.equal(dashboard, null);
    assert.equal(schedule.status, 403);
  });

  test('an anonymous caller is unauthorized rather than forbidden', async () => {
    const error = await gate(requireCapability(Capability.VIEW_DASHBOARD), {});
    assert.equal(error.status, 401);
  });

  test('admins pass a capability reserved for them', async () => {
    assert.equal(await gate(requireCapability(Capability.MANAGE_SCHEDULE), admin), null);
  });
});

describe('self or capability', () => {
  test('a student can act on their own record and not on someone else', async () => {
    const own = await gate(requireSelfOrCapability(Capability.MANAGE_USERS), {
      ...student,
      params: { id: '5' },
    });
    const other = await gate(requireSelfOrCapability(Capability.MANAGE_USERS), {
      ...student,
      params: { id: '9' },
    });
    assert.equal(own, null);
    assert.equal(other.status, 403);
  });

  test('an admin can act on someone else', async () => {
    const error = await gate(requireSelfOrCapability(Capability.MANAGE_USERS), {
      ...admin,
      params: { id: '9' },
    });
    assert.equal(error, null);
  });
});
