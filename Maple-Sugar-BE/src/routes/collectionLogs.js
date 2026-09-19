import { Router } from 'express';
import { invalid, notFound } from '../lib/ApiError.js';
import { Capability } from '../business/permissions.js';
import { requireAnyCapability, requireCapability } from '../middleware/authenticate.js';
import { cacheKeys, cacheNamespaces, TTL } from '../cache/cacheKeys.js';
import { invalidateNamespaces, readThrough } from '../cache/redisCache.js';
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

  // Only the season-only query is cached under the shared key; adding a date
  // range makes it a one-off that is not worth an entry.
  const seasonOnly = filters.season != null && !filters.from && !filters.to;
  if (!seasonOnly) {
    return res.json(await collectionLogsRepository.listCollectionLogs(filters));
  }

  const logs = await readThrough(cacheKeys.collectionLogs(filters.season), TTL.COLLECTION_LOGS, () =>
    collectionLogsRepository.listCollectionLogs(filters),
  );
  res.json(logs);
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
