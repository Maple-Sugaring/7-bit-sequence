import { Router } from 'express';
import { Capability } from '../business/permissions.js';
import { ApiError, forbidden } from '../lib/ApiError.js';
import { requireAnyCapability, requireAuth, requireCapability } from '../middleware/authenticate.js';
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
import { recordActivity, requestActivity } from '../services/activityService.js';

export const metricsRouter = Router();

const viewData = requireAnyCapability(Capability.VIEW_DASHBOARD, Capability.VIEW_DATA_TABLE);

metricsRouter.get('/', viewData, async (req, res) => {
  const filters = metricsQuery.parse(req.query);
  res.json(await metricsService.listMetrics(filters, requestActivity(req)));
});

// Weighted averages per local day/week/month across raw and compacted
// readings (BRU-007). Each period says how many readings were raw and how
// many came from hourly aggregates.
metricsRouter.get('/rollup', viewData, async (req, res) => {
  const filters = rollupQuery.parse(req.query);
  res.json(await metricsService.rollupMetrics(filters, requestActivity(req)));
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
  await recordActivity({
    ...requestActivity(req),
    kind: 'job',
    operation: 'retention.run',
    outcome: result.Status === 'succeeded' ? 'ok' : 'skipped',
    rowCount: result.Rows_Compacted ?? 0,
    detail: { run_id: result.RunID ?? null, status: result.Status, cutoff: result.Cutoff ?? null, trigger: 'manual', dry_run: dryRun },
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
  const reading = await metricsService.createMetric(body, req.user.UserID, {
    requestId: req.id,
    receivedAt: req.receivedAt,
    source: 'manual',
  });
  res.status(201).json(reading);
});

metricsRouter.patch('/:id', requireAuth, async (req, res) => {
  if (!req.user.Can_Overwrite_Measurements) throw forbidden('Measurement corrections are disabled for your account.');
  const id = idParam.parse(req.params.id);
  const { Expected_Revision, Correction_Reason, ...changes } = updateMetricBody.parse(req.body);
  res.json(
    await metricsService.updateMetric(id, changes, req.user.UserID, Expected_Revision, Correction_Reason, requestActivity(req)),
  );
});
