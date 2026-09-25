import { Router } from 'express';
import { Capability } from '../business/permissions.js';
import { requireCapability } from '../middleware/authenticate.js';
import * as weatherService from '../services/weatherService.js';
import { dailyWeatherQuery } from './schemas.js';

export const weatherRouter = Router();

weatherRouter.get('/daily', requireCapability(Capability.VIEW_DASHBOARD), async (req, res) => {
  const { year, nodeId } = dailyWeatherQuery.parse(req.query);
  res.json(await weatherService.getDaily({ year, nodeId }));
});

weatherRouter.get('/compare', requireCapability(Capability.VIEW_DATA_TABLE), async (req, res) => {
  const { year } = dailyWeatherQuery.parse(req.query);
  res.json(await weatherService.getCompare(year ?? 2024));
});

weatherRouter.get('/live', requireCapability(Capability.VIEW_DASHBOARD), async (req, res) => {
  res.json(await weatherService.getLive());
});
