/**
 * Reference data: near-static lookups the UI needs to render labels and filter
 * dropdowns. Long TTLs, since these change only on an admin action or a
 * hardware install.
 */

import { Router } from 'express';
import { Capability } from '../business/permissions.js';
import { notFound } from '../lib/ApiError.js';
import { requireAnyCapability, requireAuth, requireCapability } from '../middleware/authenticate.js';
import { cacheKeys, cacheNamespaces, TTL } from '../cache/cacheKeys.js';
import { invalidateNamespaces, readThrough } from '../cache/redisCache.js';
import { createGatewayBody, idParam, updateGatewayBody } from './schemas.js';
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

referenceRouter.post('/gateways', requireCapability(Capability.DEPLOY_NODES), async (req, res) => {
  const body = createGatewayBody.parse(req.body);
  const gateway = await nodesRepository.createGateway(body);
  await invalidateNamespaces([cacheNamespaces.GATEWAYS]);
  res.status(201).json(gateway);
});

referenceRouter.patch('/gateways/:id', requireCapability(Capability.DEPLOY_NODES), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { Latitude, Longitude, Notes, ...rest } = updateGatewayBody.parse(req.body);
  const changes = { ...rest };
  if (Notes !== undefined) changes.Notes = Notes || null;
  if (Latitude !== undefined || Longitude !== undefined) {
    changes.Location = Latitude == null || Longitude == null ? null : { lat: Latitude, lon: Longitude };
  }

  const gateway = await nodesRepository.updateGateway(id, changes);
  if (!gateway) throw notFound('Gateway');
  // Node rows carry the gateway's label, so both caches go stale.
  await invalidateNamespaces([cacheNamespaces.GATEWAYS, cacheNamespaces.NODES]);
  res.json(gateway);
});

referenceRouter.delete('/gateways/:id', requireCapability(Capability.DEPLOY_NODES), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const removed = await nodesRepository.deleteGateway(id);
  if (!removed) throw notFound('Gateway');
  await invalidateNamespaces([cacheNamespaces.GATEWAYS, cacheNamespaces.NODES]);
  res.status(204).end();
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
