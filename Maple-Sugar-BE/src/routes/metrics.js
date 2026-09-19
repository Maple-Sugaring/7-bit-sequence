import { Router } from 'express';
import { Capability } from '../business/permissions.js';
import { requireAnyCapability, requireCapability } from '../middleware/authenticate.js';
import { createMetricBody, idParam, metricsQuery, updateMetricBody } from './schemas.js';
import * as metricsService from '../services/metricsService.js';

export const metricsRouter = Router();

metricsRouter.get(
  '/',
  requireAnyCapability(Capability.VIEW_DASHBOARD, Capability.VIEW_DATA_TABLE),
  async (req, res) => {
  const filters = metricsQuery.parse(req.query);
  res.json(await metricsService.listMetrics(filters));
});

metricsRouter.post('/', requireCapability(Capability.RECORD_DATA), async (req, res) => {
  const body = createMetricBody.parse(req.body);
  const reading = await metricsService.createMetric(body, req.user.UserID);
  res.status(201).json(reading);
});

// Correcting an already-recorded reading is an admin action; students record but
// do not revise.
metricsRouter.patch('/:id', requireCapability(Capability.EDIT_DATA), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const changes = updateMetricBody.parse(req.body);
  res.json(await metricsService.updateMetric(id, changes));
});
