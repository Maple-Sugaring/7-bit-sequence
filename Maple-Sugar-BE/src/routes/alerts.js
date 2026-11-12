import { Router } from 'express';
import { notFound } from '../lib/ApiError.js';
import { Capability } from '../business/permissions.js';
import { requireAnyCapability, requireCapability } from '../middleware/authenticate.js';
import { cacheNamespaces } from '../cache/cacheKeys.js';
import { invalidateNamespaces } from '../cache/redisCache.js';
import * as alertsRepository from '../repositories/alertsRepository.js';
import { alertsQuery, idParam, updateAlertBody } from './schemas.js';

export const alertsRouter = Router();

alertsRouter.get(
  '/',
  requireAnyCapability(Capability.VIEW_DASHBOARD, Capability.VIEW_ALERTS),
  async (req, res) => {
  const { resolved } = alertsQuery.parse(req.query);

  res.json(await alertsRepository.listAlerts({ resolved }));
});

alertsRouter.patch('/:id', requireCapability(Capability.RESOLVE_ALERTS), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { Is_Resolved } = updateAlertBody.parse(req.body);

  const alert = await alertsRepository.setResolved(id, Is_Resolved);
  if (!alert) throw notFound('Alert');

  await invalidateNamespaces([cacheNamespaces.ALERTS]);
  res.json(alert);
});
