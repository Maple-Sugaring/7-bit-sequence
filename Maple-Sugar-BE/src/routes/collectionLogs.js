import { Router } from 'express';
import { invalid, notFound } from '../lib/ApiError.js';
import { Capability } from '../business/permissions.js';
import { requireAnyCapability, requireCapability } from '../middleware/authenticate.js';
import { cacheNamespaces } from '../cache/cacheKeys.js';
import { invalidateNamespaces } from '../cache/redisCache.js';
import { validateCollectionLog } from '../business/validation.js';
import * as collectionLogsRepository from '../repositories/collectionLogsRepository.js';
import * as bucketsRepository from '../repositories/bucketsRepository.js';
import { collectionLogsQuery, createCollectionLogBody } from './schemas.js';

export const collectionLogsRouter = Router();

collectionLogsRouter.get(
  '/',
  requireAnyCapability(Capability.VIEW_DASHBOARD, Capability.VIEW_DATA_TABLE),
  async (req, res) => {
  const filters = collectionLogsQuery.parse(req.query);

  if (filters.limit != null || filters.before != null) {
    const limit = filters.limit ?? 20;
    const logs = await collectionLogsRepository.listCollectionLogs({ ...filters, limit: limit + 1 });
    const items = logs.slice(0, limit);
    return res.json({ items, next: logs.length > limit ? items.at(-1).LogID : null });
  }

  res.json(await collectionLogsRepository.listCollectionLogs(filters));
});

collectionLogsRouter.post('/', requireCapability(Capability.RECORD_DATA), async (req, res) => {
  const body = createCollectionLogBody.parse(req.body);

  const { errors, isValid } = validateCollectionLog(body);
  if (!isValid) throw invalid('Some fields need attention.', errors);

  const bucket = await bucketsRepository.findBucketById(body.BucketID);
  if (!bucket) throw notFound('Bucket');

  const log = await collectionLogsRepository.createCollectionLog({
    ...body,
    // From the session, not the body: a collection is credited to whoever did it.
    UserID: req.user.UserID,
  });

  await invalidateNamespaces([cacheNamespaces.COLLECTION_LOGS, cacheNamespaces.DASHBOARD]);
  res.status(201).json(log);
});
