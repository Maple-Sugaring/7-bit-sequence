import { Router } from 'express';
import { forbidden, notFound } from '../lib/ApiError.js';
import { can, Capability } from '../business/permissions.js';
import { requireAnyCapability, requireAuth, requireCapability } from '../middleware/authenticate.js';
import { cacheKeys, cacheNamespaces, TTL } from '../cache/cacheKeys.js';
import { invalidateNamespaces, readThrough } from '../cache/redisCache.js';
import * as nodesRepository from '../repositories/nodesRepository.js';
import * as alertsRepository from '../repositories/alertsRepository.js';
import * as metricsRepository from '../repositories/metricsRepository.js';
import * as journalRepository from '../repositories/journalRepository.js';
import { query } from '../db/pool.js';
import { flagNodeBody, idParam, nodeActionBody, updateNodeBody } from './schemas.js';

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
  '/board',
  requireAnyCapability(Capability.VIEW_DASHBOARD, Capability.VIEW_NODES),
  async (req, res) => {
    res.json(await nodesRepository.listBoard());
  },
);

nodesRouter.post('/:id/actions', requireAuth, async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { Action, Notes } = nodeActionBody.parse(req.body ?? {});
  const node = await nodesRepository.findNodeById(id);
  if (!node) throw notFound('Node');

  if (Action === 'collect' && !can(req.role, Capability.RECORD_DATA)) {
    throw forbidden('Your role cannot collect a bucket.');
  }
  if (Action !== 'collect' && !can(req.role, Capability.FLAG_NODE) && !can(req.role, Capability.MANAGE_USERS)) {
    throw forbidden('Your role cannot change node status.');
  }

  if (Action === 'maintenance') {
    const updated = await nodesRepository.updateNode(id, { Status_Code: 3 });
    await invalidateNamespaces([cacheNamespaces.NODES]);
    return res.json(updated);
  }
  if (Action === 'online') {
    const updated = await nodesRepository.updateNode(id, { Status_Code: 1 });
    await invalidateNamespaces([cacheNamespaces.NODES]);
    return res.json(updated);
  }

  const board = (await nodesRepository.listBoard()).find((item) => item.NodeID === id);
  const tare = board?.Tare_Weight ?? 2;
  await metricsRepository.createMetric({
    NodeID: id,
    BucketID: board?.BucketID ?? null,
    Recorded_By_UserID: req.user.UserID,
    Weight: tare,
    Weather_Conditions: 'Collected',
    Ice_Present: false,
  });
  await journalRepository.createEntry({
    UserID: req.user.UserID,
    NodeID: id,
    BucketID: board?.BucketID ?? null,
    Title: `Collected ${node.Node_Name}`,
    Process_Notes: Notes?.trim() || 'Bucket emptied from the bush dashboard.',
    Weight: tare,
    Ice_Present: false,
  });
  await query(
    `update alerts
        set is_resolved = true
      where node_id = $1
        and is_resolved = false
        and alert_type in ('Full Bucket', 'Collection Needed')`,
    [id],
  );
  await invalidateNamespaces([cacheNamespaces.NODES, cacheNamespaces.METRICS, cacheNamespaces.ALERTS]);
  res.json(await nodesRepository.findNodeById(id));
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
