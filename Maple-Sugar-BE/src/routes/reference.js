/**
 * Reference data: near-static lookups the UI needs to render labels and filter
 * dropdowns. Long TTLs, since these change only on an admin action or a
 * hardware install.
 */

import { Router } from 'express';
import { Capability } from '../business/permissions.js';
import { requireAnyCapability, requireAuth, requireCapability } from '../middleware/authenticate.js';
import { cacheKeys, TTL } from '../cache/cacheKeys.js';
import { readThrough } from '../cache/redisCache.js';
import * as usersRepository from '../repositories/usersRepository.js';
import * as nodesRepository from '../repositories/nodesRepository.js';
import * as bucketsRepository from '../repositories/bucketsRepository.js';
import * as guidesRepository from '../repositories/guidesRepository.js';

export const referenceRouter = Router();

// Role names back the role selector on the admin screen and the label beside a
// user's name, so any signed-in user may read them.
referenceRouter.get('/roles', requireAuth, async (req, res) => {
  res.json(await readThrough(cacheKeys.roles(), TTL.USERS, () => usersRepository.listRoles()));
});

referenceRouter.get(
  '/gateways',
  requireAnyCapability(Capability.VIEW_DASHBOARD, Capability.VIEW_NODES),
  async (req, res) => {
  res.json(
    await readThrough(cacheKeys.gateways(), TTL.NODE_HEALTH, () => nodesRepository.listGateways()),
  );
});

referenceRouter.get(
  '/buckets',
  requireAnyCapability(Capability.VIEW_DASHBOARD, Capability.VIEW_DATA_TABLE),
  async (req, res) => {
  res.json(
    await readThrough(cacheKeys.buckets(), TTL.BUCKETS, () => bucketsRepository.listBuckets()),
  );
});

referenceRouter.get('/guides', requireCapability(Capability.VIEW_GUIDES), async (req, res) => {
  res.json(await readThrough(cacheKeys.guides(), TTL.USERS, () => guidesRepository.listGuides()));
});
