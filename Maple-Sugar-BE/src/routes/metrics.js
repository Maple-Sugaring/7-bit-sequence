import { Router } from 'express';
import { Capability } from '../business/permissions.js';
import { ApiError } from '../lib/ApiError.js';
import { requireAnyCapability, requireCapability } from '../middleware/authenticate.js';
import {
  createMetricBody,
  idParam,
  metricsQuery,
  retentionRunBody,
  rollupQuery,
  updateMetricBody,
} from './schemas.js';
import * as metricsService from '../services/metricsService.js';
import * as metricRetention from '../services/metricRetention.js';

export const metricsRouter = Router();

const viewData = requireAnyCapability(Capability.VIEW_DASHBOARD, Capability.VIEW_DATA_TABLE);

metricsRouter.get('/', viewData, async (req, res) => {
  const filters = metricsQuery.parse(req.query);
  res.json(await metricsService.listMetrics(filters));
});

// Weighted averages per local day/week/month across raw and compacted
// readings (BRU-007). Each period says how many readings were raw and how
// many came from hourly aggregates.
metricsRouter.get('/rollup', viewData, async (req, res) => {
  const filters = rollupQuery.parse(req.query);
  res.json(await metricsService.rollupMetrics(filters));
});

// Storage use and retention policy. Admin only: it exposes the job controls.
metricsRouter.get('/retention', requireCapability(Capability.EDIT_DATA), async (req, res) => {
  res.json(await metricRetention.storageReport());
});

metricsRouter.post('/retention/run', requireCapability(Capability.EDIT_DATA), async (req, res) => {
  const { dryRun } = retentionRunBody.parse(req.body ?? {});
  const result = await metricRetention.runRetention({
    trigger: 'manual',
    userId: req.user.UserID,
    dryRun,
  });
  if (result.Status === 'skipped') {
    throw new ApiError(result.Reason, { status: 409, code: 'RETENTION_BUSY' });
  }
  if (result.Status === 'disabled') {
    throw new ApiError('Aggregation is off (METRICS_RAW_RETENTION_DAYS=0).', { status: 409, code: 'RETENTION_DISABLED' });
  }
  res.json(result);
});

metricsRouter.post('/', requireCapability(Capability.RECORD_DATA), async (req, res) => {
  const body = createMetricBody.parse(req.body);
  const reading = await metricsService.createMetric(body, req.user.UserID);
  res.status(201).json(reading);
});

// Correcting an already-recorded reading is an admin action; students record but
// do not revise. The correction is stamped with who made it and the row is then
// kept raw by the retention job.
metricsRouter.patch('/:id', requireCapability(Capability.EDIT_DATA), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const changes = updateMetricBody.parse(req.body);
  res.json(await metricsService.updateMetric(id, changes, req.user.UserID));
});
