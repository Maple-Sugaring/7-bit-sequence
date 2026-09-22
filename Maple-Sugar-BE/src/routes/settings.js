import { Router } from 'express';
import { Capability } from '../business/permissions.js';
import { requireCapability } from '../middleware/authenticate.js';
import { cacheNamespaces } from '../cache/cacheKeys.js';
import { invalidateNamespaces } from '../cache/redisCache.js';
import * as settingsRepository from '../repositories/settingsRepository.js';
import { updateSettingsBody } from './schemas.js';

export const settingsRouter = Router();

settingsRouter.get('/', requireCapability(Capability.VIEW_DASHBOARD), async (req, res) => {
  const seconds = await settingsRepository.getReportIntervalSeconds();
  res.json({
    Report_Interval_Seconds: seconds,
    Report_Interval_Minutes: Math.round(seconds / 60),
  });
});

settingsRouter.patch('/', requireCapability(Capability.MANAGE_USERS), async (req, res) => {
  const { Report_Interval_Minutes: minutes } = updateSettingsBody.parse(req.body);
  const seconds = await settingsRepository.setReportIntervalMinutes(minutes);
  await invalidateNamespaces([cacheNamespaces.NODES]);
  res.json({
    Report_Interval_Seconds: seconds,
    Report_Interval_Minutes: minutes,
  });
});
