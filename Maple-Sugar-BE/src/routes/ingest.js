/**
 * Raspberry Pi push. nginx exposes this as POST /api/ingest.
 *
 * Session cookies are ignored. The gateway token is the only credential.
 */

import { Router } from 'express';
import { requireGateway } from '../middleware/authenticate.js';
import { ingestReadings } from '../services/ingestService.js';
import { ingestBuffer, isDatabaseUnavailable } from '../services/readingBuffer.js';
import { ingestBody } from './schemas.js';
import { recordActivity } from '../services/activityService.js';

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
  let result;
  try {
    result = await ingestReadings({ ...batch, clientIp: req.ip, receivedAt: req.receivedAt, requestId: req.id });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    // The receipt time and request id ride along, so the replay stores when
    // the batch really arrived, not when Postgres came back (FR-036).
    await ingestBuffer.enqueue({
      ...batch,
      clientIp: req.ip,
      receivedAt: req.receivedAt.toISOString(),
      requestId: req.id,
    });
    // Usually fails too while the database is down; the log line still has the id.
    await recordActivity({
      kind: 'ingest',
      operation: 'ingest.buffered',
      requestId: req.id,
      receivedAt: req.receivedAt,
      rowCount: batch.readings.length,
      detail: { gateway_code: batch.gatewayCode },
    });
    return res.status(202).json({
      Buffered: true,
      Accepted: [],
      Rejected: [],
      message: 'The database is unreachable. This batch is stored locally and will be saved when the connection returns.',
    });
  }

  if (!result.Accepted.length) {
    return res.status(422).json({
      message: 'No readings were stored.',
      code: 'VALIDATION',
      details: { Rejected: result.Rejected },
    });
  }

  const created = result.Accepted.some((item) => item.Reading && !item.Duplicate);
  res.status(created ? 201 : 200).json(result);
});
