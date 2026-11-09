import { Router } from 'express';
import { z } from 'zod';
import { queryOne } from '../db/pool.js';
import { Capability } from '../business/permissions.js';
import { requireCapability } from '../middleware/authenticate.js';
import { cacheNamespaces } from '../cache/cacheKeys.js';
import { invalidateNamespaces } from '../cache/redisCache.js';
import * as settingsRepository from '../repositories/settingsRepository.js';
import { updateSettingsBody } from './schemas.js';

export const settingsRouter = Router();

const dataModeBody = z.object({ mode: z.enum(['test', 'production']) });

settingsRouter.get('/data-mode', requireCapability(Capability.VIEW_DASHBOARD), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await queryOne('select mode from site_data_mode where singleton'));
});

settingsRouter.patch('/data-mode', requireCapability(Capability.MANAGE_USERS), async (req, res) => {
  const { mode } = dataModeBody.parse(req.body);
  res.set('Cache-Control', 'no-store');
  res.json(await queryOne('update site_data_mode set mode = $1 where singleton returning mode', [mode]));
});

settingsRouter.get('/', requireCapability(Capability.VIEW_DASHBOARD), async (req, res) => {
  const seconds = await settingsRepository.getReportIntervalSeconds();
  res.json({
    Report_Interval_Seconds: seconds,
    Report_Interval_Minutes: Math.round(seconds / 60),
  });
});

settingsRouter.patch('/', requireCapability(Capability.MANAGE_USERS), async (req, res) => {
  const { seconds } = updateSettingsBody.parse(req.body);
  await settingsRepository.setReportIntervalSeconds(seconds);
  await invalidateNamespaces([cacheNamespaces.NODES]);
  res.json({
    Report_Interval_Seconds: seconds,
    Report_Interval_Minutes: Math.round(seconds / 60),
  });
});
