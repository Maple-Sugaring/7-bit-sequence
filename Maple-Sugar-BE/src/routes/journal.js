import { Router } from 'express';
import { Capability, can } from '../business/permissions.js';
import { requireCapability } from '../middleware/authenticate.js';
import * as journalRepository from '../repositories/journalRepository.js';
import { createJournalBody } from './schemas.js';

export const journalRouter = Router();

journalRouter.get('/', requireCapability(Capability.RECORD_DATA), async (req, res) => {
  const userId = can(req.role, Capability.MANAGE_USERS) ? null : req.user.UserID;
  res.json(await journalRepository.listEntries(userId));
});

journalRouter.post('/', requireCapability(Capability.RECORD_DATA), async (req, res) => {
  const body = createJournalBody.parse(req.body);
  const entry = await journalRepository.createEntry({
    ...body,
    UserID: req.user.UserID,
  });
  res.status(201).json(entry);
});
