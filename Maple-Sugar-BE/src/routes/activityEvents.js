/**
 * Admin trace view over activity_events (FR-036). Same gate as /audit-events.
 * Opening the view is itself recorded, so access to the trace is traceable.
 */

import { Router } from 'express';
import { Capability } from '../business/permissions.js';
import { notFound } from '../lib/ApiError.js';
import { requireCapability } from '../middleware/authenticate.js';
import * as activityService from '../services/activityService.js';
import { activityQuery, idParam } from './schemas.js';

export const activityEventsRouter = Router();

const adminOnly = requireCapability(Capability.MANAGE_USERS);

activityEventsRouter.get('/', adminOnly, async (req, res) => {
  const filters = activityQuery.parse(req.query);
  const page = await activityService.listActivity(filters);
  await activityService.recordActivity({
    ...activityService.requestActivity(req),
    kind: 'read',
    operation: 'activity.list',
    rowCount: page.items.length,
    detail: { filters },
  });
  res.json(page);
});

// Retention, access and what each timestamp means.
activityEventsRouter.get('/policy', adminOnly, (req, res) => {
  res.json(activityService.activityPolicy());
});

activityEventsRouter.get('/metrics/:id', adminOnly, async (req, res) => {
  const id = idParam.parse(req.params.id);
  const trace = await activityService.traceMetric(id);
  if (!trace) throw notFound('Reading');
  await activityService.recordActivity({
    ...activityService.requestActivity(req),
    kind: 'read',
    operation: 'metric.trace',
    entityType: 'metric',
    entityId: id,
    nodeId: trace.Reading.NodeID,
    rowCount: trace.Activity.length,
  });
  res.json(trace);
});
