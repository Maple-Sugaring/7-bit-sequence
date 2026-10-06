import { Router } from 'express';
import { Capability } from '../business/permissions.js';
import { requireCapability } from '../middleware/authenticate.js';
import * as collectionsService from '../services/collectionsService.js';
import { createCollectionBody } from './schemas.js';

export const collectionsRouter = Router();

// Records a collection: the reading, the collection log, and the journal entry
// in one request. A repeat of the same Client_Ref returns 200 with the entry
// already stored, so an offline retry never files a collection twice.
collectionsRouter.post('/', requireCapability(Capability.RECORD_DATA), async (req, res) => {
  const body = createCollectionBody.parse(req.body);
  const result = await collectionsService.recordCollection(body, req.user);
  res.status(result.Duplicate ? 200 : 201).json(result);
});
