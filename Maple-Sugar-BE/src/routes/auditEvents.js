import { Router } from 'express';
import { z } from 'zod';
import { Capability } from '../business/permissions.js';
import { queryAll } from '../db/pool.js';
import { requireCapability } from '../middleware/authenticate.js';

export const auditEventsRouter = Router();

const pageQuery = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

auditEventsRouter.get('/', requireCapability(Capability.MANAGE_USERS), async (req, res) => {
  const { before, limit } = pageQuery.parse(req.query);
  const events = await queryAll(
    `select id, event_type, actor_id, target_id, note, created_at
       from audit_events
      where (not demo_fixture or active_data_mode() = 'test') and ($1::bigint is null or id < $1)
      order by id desc
      limit $2`,
    [before ?? null, limit + 1],
  );
  const items = events.slice(0, limit);
  res.json({ items, next: events.length > limit ? items.at(-1).id : null });
});
