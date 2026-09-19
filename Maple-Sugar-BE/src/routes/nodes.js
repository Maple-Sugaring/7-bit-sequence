import { Router } from 'express';
import { notFound } from '../lib/ApiError.js';
import { Capability } from '../business/permissions.js';
import { requireAnyCapability, requireCapability } from '../middleware/authenticate.js';
import { cacheKeys, cacheNamespaces, TTL } from '../cache/cacheKeys.js';
import { invalidateNamespaces, readThrough } from '../cache/redisCache.js';
import * as nodesRepository from '../repositories/nodesRepository.js';
import * as alertsRepository from '../repositories/alertsRepository.js';
import { flagNodeBody, idParam, updateNodeBody } from './schemas.js';

export const nodesRouter = Router();

nodesRouter.get(
  '/',
  requireAnyCapability(Capability.VIEW_DASHBOARD, Capability.VIEW_NODES),
  async (req, res) => {
  const nodes = await readThrough(cacheKeys.nodesHealth(), TTL.NODE_HEALTH, () =>
    nodesRepository.listNodes(),
  );
  res.json(nodes);
});

nodesRouter.get(
  '/:id',
  requireAnyCapability(Capability.VIEW_DASHBOARD, Capability.VIEW_NODES),
  async (req, res) => {
  const id = idParam.parse(req.params.id);
  const node = await readThrough(cacheKeys.node(id), TTL.NODE_HEALTH, () =>
    nodesRepository.findNodeById(id),
  );
  if (!node) throw notFound('Node');
  res.json(node);
});

// Taking a node in and out of maintenance changes what the dashboard counts as
// a fault, so it is an admin action.
nodesRouter.patch('/:id', requireCapability(Capability.MANAGE_USERS), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const changes = updateNodeBody.parse(req.body);

  const node = await nodesRepository.updateNode(id, changes);
  if (!node) throw notFound('Node');

  await invalidateNamespaces([cacheNamespaces.NODES]);
  res.json(node);
});

/**
 * Raises an alert against a node from the field, for anything the sensors cannot
 * see themselves: a cracked bucket, a chewed cable, a tap that has dried up.
 */
nodesRouter.post('/:id/flag', requireCapability(Capability.FLAG_NODE), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { type, description } = flagNodeBody.parse(req.body ?? {});

  const node = await nodesRepository.findNodeById(id);
  if (!node) throw notFound('Node');

  const alert = await alertsRepository.createAlert({
    NodeID: id,
    Alert_Type: type,
    Description: description ?? `${node.Node_Name} flagged for review.`,
    severity: 'warning',
  });

  await invalidateNamespaces([cacheNamespaces.ALERTS, cacheNamespaces.NODES]);
  res.status(201).json(alert);
});
