/**
 * Raspberry Pi push. nginx exposes this as POST /api/ingest.
 *
 * Session cookies are ignored. The gateway token is the only credential.
 */

import { Router } from 'express';
import { requireGateway } from '../middleware/authenticate.js';
import { ingestBody } from './schemas.js';
import { ingestReadings } from '../services/ingestService.js';

export const ingestRouter = Router();

function asBatch(body) {
  if (Array.isArray(body.Readings)) {
    return { gatewayCode: body.Gateway_Code, readings: body.Readings };
  }
  const { Gateway_Code, ...reading } = body;
  return { gatewayCode: Gateway_Code, readings: [reading] };
}

ingestRouter.post('/', requireGateway, async (req, res) => {
  const batch = asBatch(ingestBody.parse(req.body));
  const result = await ingestReadings({ ...batch, clientIp: req.ip });

  if (!result.Accepted.length) {
    return res.status(422).json({
      message: 'No readings were stored.',
      code: 'VALIDATION',
      details: { Rejected: result.Rejected },
    });
  }

  const created = result.Accepted.some((item) => !item.Duplicate);
  res.status(created ? 201 : 200).json(result);
});
