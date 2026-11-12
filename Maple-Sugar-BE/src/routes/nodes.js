import { Router } from 'express';
import { z } from 'zod';
import { listSensorLifecycle, recordSensorEvent } from '../repositories/sensorLifecycleRepository.js';
import { forbidden, notFound } from '../lib/ApiError.js';
import { can, Capability } from '../business/permissions.js';
import { requireAnyCapability, requireAuth, requireCapability } from '../middleware/authenticate.js';
import { cacheKeys, cacheNamespaces, TTL } from '../cache/cacheKeys.js';
import { invalidateNamespaces, readThrough } from '../cache/redisCache.js';
import * as nodesRepository from '../repositories/nodesRepository.js';
import * as alertsRepository from '../repositories/alertsRepository.js';
import * as metricsRepository from '../repositories/metricsRepository.js';
import * as collectionLogsRepository from '../repositories/collectionLogsRepository.js';
import * as journalRepository from '../repositories/journalRepository.js';
import * as calibrationRepository from '../repositories/calibrationRepository.js';
import { transaction } from '../db/pool.js';
import { FAULT_ALERT_TYPES } from '../business/alerting.js';
import { liveState } from '../business/calibration.js';
import { calibrationBody, createNodeBody, flagNodeBody, idParam, nodeActionBody, nodeDetailsBody, nodeIntervalBody, updateNodeBody } from './schemas.js';
import { recordActivity, requestActivity } from '../services/activityService.js';

export const nodesRouter = Router();

nodesRouter.get(
  '/',
  requireAnyCapability(Capability.VIEW_DASHBOARD, Capability.VIEW_NODES),
  async (req, res) => {
  res.json(await nodesRepository.listNodes());
});

nodesRouter.get(
  '/board',
  requireAnyCapability(Capability.VIEW_DASHBOARD, Capability.VIEW_NODES),
  async (req, res) => {
    res.json(await nodesRepository.listBoard());
  },
);

const sensorEventBody = z.object({
  type: z.enum(['installation', 'replacement', 'maintenance']),
  date: z.iso.date().refine(
    (date) => date <= new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()),
    'The event date cannot be in the future.',
  ),
  sensorType: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
}).refine((event) => event.type === 'maintenance' ? Boolean(event.notes) : Boolean(event.sensorType), {
  message: 'Provide a sensor type for installation or replacement, or notes for maintenance.',
});

nodesRouter.get('/lifecycle', requireCapability(Capability.MANAGE_USERS), async (req, res) => {
  res.json(await listSensorLifecycle());
});

nodesRouter.post('/:id/lifecycle', requireCapability(Capability.MANAGE_USERS), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const event = sensorEventBody.parse(req.body);
  const result = await recordSensorEvent(id, event, req.user.UserID);
  if (!result) throw notFound('Node');
  res.status(201).json(result);
});

nodesRouter.post('/', requireCapability(Capability.DEPLOY_NODES), async (req, res) => {
  const body = createNodeBody.parse(req.body);
  const node = await nodesRepository.createDeployedNode(body, req.user.UserID);
  await invalidateNamespaces([cacheNamespaces.NODES]);
  res.status(201).json(node);
});

nodesRouter.delete('/:id', requireCapability(Capability.DEPLOY_NODES), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const removed = await nodesRepository.deleteNode(id);
  if (!removed) throw notFound('Node');
  await invalidateNamespaces([cacheNamespaces.NODES, cacheNamespaces.METRICS, cacheNamespaces.ALERTS]);
  res.status(204).end();
});

const tapBody = z.object({ action: z.enum(['setup', 'remove']) });

nodesRouter.post('/:id/tap', requireCapability(Capability.DEPLOY_NODES), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { action } = tapBody.parse(req.body);
  const removed = action === 'remove';
  await transaction(async (client) => {
    const { rowCount } = await client.query(
      `update node set status_code = $2, tap_removed = $3
        where id = $1 and (not demo_fixture or lock_data_mode() = 'test') and tap_removed is distinct from $3`,
      [id, removed ? 3 : 0, removed],
    );
    if (rowCount) {
      await client.query(
        'insert into audit_events (event_type, actor_id, target_id, note) values ($1, $2, $3, $4)',
        [removed ? 'tap_removed' : 'tap_setup', req.user.UserID, id, removed ? 'Tap pulled for the semester.' : 'Tap set up.'],
      );
    } else if (!(await client.query('select id from visible_nodes where id = $1', [id])).rowCount) {
      throw notFound('Node');
    }
  });
  await invalidateNamespaces([cacheNamespaces.NODES]);
  res.status(204).end();
});

nodesRouter.post('/:id/actions', requireAuth, async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { Action, Notes } = nodeActionBody.parse(req.body ?? {});
  const node = await nodesRepository.findNodeById(id);
  if (!node) throw notFound('Node');

  if (Action === 'collect' && !can(req.role, Capability.RECORD_DATA)) {
    throw forbidden('Your role cannot collect a bucket.');
  }
  if (Action !== 'collect' && !can(req.role, Capability.FLAG_NODE) && !can(req.role, Capability.MANAGE_USERS)) {
    throw forbidden('Your role cannot change node status.');
  }

  if (Action === 'maintenance') {
    const updated = await nodesRepository.updateNode(id, { Status_Code: 3 });
    await invalidateNamespaces([cacheNamespaces.NODES]);
    return res.json(updated);
  }
  if (Action === 'online') {
    const updated = await nodesRepository.updateNode(id, { Status_Code: 1 });
    await invalidateNamespaces([cacheNamespaces.NODES]);
    return res.json(updated);
  }

  const board = (await nodesRepository.listBoard()).find((item) => item.NodeID === id);
  const tare = board?.Tare_Weight ?? 2;
  const bucketId = board?.BucketID ?? null;
  const notes = Notes?.trim() || 'Bucket emptied from the bush dashboard.';
  await transaction(async (client) => {
    const reading = await metricsRepository.createMetric({
      NodeID: id,
      BucketID: bucketId,
      Recorded_By_UserID: req.user.UserID,
      Weight: tare,
      Weather_Conditions: 'Collected',
      Ice_Present: false,
      Received_At: req.receivedAt,
      Request_ID: req.id,
    }, client);
    await recordActivity({
      ...requestActivity(req),
      kind: 'write',
      operation: 'metric.create',
      entityType: 'metric',
      entityId: reading.MetricID,
      nodeId: id,
      detail: { source: 'dashboard_collect', recorded_at: reading.Recorded_At, received_at: reading.Received_At },
    }, client);
    await journalRepository.createEntry({
      UserID: req.user.UserID,
      NodeID: id,
      BucketID: bucketId,
      Title: `Collected ${node.Node_Name}`,
      Process_Notes: notes,
      Weight: tare,
      Ice_Present: false,
      Submitted_Role: req.role,
    }, client);
    await collectionLogsRepository.createCollectionLog({
      NodeID: id,
      BucketID: bucketId,
      UserID: req.user.UserID,
      Volume_Collected: null,
      Quality_Notes: notes,
    }, client);
    await client.query(
      `update alerts
          set is_resolved = true
        where node_id = $1
          and data_mode = active_data_mode()
          and is_resolved = false
          and alert_type in ('Full Bucket', 'Collection Needed')`,
      [id],
    );
  });
  await invalidateNamespaces([cacheNamespaces.NODES, cacheNamespaces.METRICS, cacheNamespaces.ALERTS]);
  res.json(await nodesRepository.findNodeById(id));
});

nodesRouter.get(
  '/:id',
  requireAnyCapability(Capability.VIEW_DASHBOARD, Capability.VIEW_NODES),
  async (req, res) => {
  const id = idParam.parse(req.params.id);
  const node = await readThrough(cacheKeys.node(id), TTL.NODE_HEALTH, () =>
    nodesRepository.findNodeById(id),
  );
  if (!node) throw notFound('Node');
  res.json(node);
});

// Taking a node in and out of maintenance changes what the dashboard counts as
// a fault, so it is an admin action.
nodesRouter.patch('/:id/details', requireCapability(Capability.DEPLOY_NODES), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const body = nodeDetailsBody.parse(req.body);
  const node = await nodesRepository.updateNode(id, {
    Node_Name: body.Node_Name,
    Stand: body.Stand,
    Location: { lat: body.Latitude, lon: body.Longitude },
    ...(body.Rf_Tag !== undefined ? { Rf_Tag: body.Rf_Tag || null } : {}),
    ...(body.Notes !== undefined ? { Notes: body.Notes || null } : {}),
    ...(body.GatewayID != null ? { GatewayID: body.GatewayID } : {}),
  });
  if (!node) throw notFound('Node');
  await invalidateNamespaces([cacheNamespaces.NODES]);
  res.json(node);
});

nodesRouter.patch('/:id/interval', requireCapability(Capability.DEPLOY_NODES), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { seconds } = nodeIntervalBody.parse(req.body);
  const node = await nodesRepository.updateNode(id, { Report_Interval_Seconds: seconds });
  if (!node) throw notFound('Node');
  await invalidateNamespaces([cacheNamespaces.NODES]);
  res.json(node);
});

/**
 * Tare and test-weight calibration over LoRa. The command rides back to the
 * node on its next packet, so the page polls GET until it settles. `Live` is
 * what the platform reads meanwhile, so the person can see the weight is on.
 */
nodesRouter.get('/:id/calibration', requireCapability(Capability.DEPLOY_NODES), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const node = await nodesRepository.findNodeById(id);
  if (!node) throw notFound('Node');
  const [command, lastCalibration, lastScale, [latest], fault] = await Promise.all([
    calibrationRepository.findLatestCommand(id),
    calibrationRepository.findLastCalibration(id),
    calibrationRepository.findLastScale(id),
    metricsRepository.listRecentForNode(id, 1),
    alertsRepository.findOpenAlertOfTypes(id, FAULT_ALERT_TYPES),
  ]);
  res.json({
    NodeID: id,
    Report_Interval_Seconds: node.Report_Interval_Seconds,
    Command: command,
    Last_Calibration: lastCalibration,
    Last_Scale: lastScale,
    Live: liveState(node, latest, fault),
  });
});

nodesRouter.post('/:id/calibration', requireCapability(Capability.DEPLOY_NODES), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const body = calibrationBody.parse(req.body ?? {});
  const node = await nodesRepository.findNodeById(id);
  if (!node) throw notFound('Node');
  const command = await calibrationRepository.queueCommand({
    nodeId: id,
    action: body.Action,
    pounds: body.Action === 'calibrate' ? body.Pounds : null,
    userId: req.user.UserID,
  });
  res.status(202).json(command);
});

/**
 * Cancels the waiting command so the next ingest reply no longer carries it.
 * Answers with the node's latest command, which is the settled one when the
 * node answered before the cancel landed.
 */
nodesRouter.delete('/:id/calibration', requireCapability(Capability.DEPLOY_NODES), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const node = await nodesRepository.findNodeById(id);
  if (!node) throw notFound('Node');
  const cancelled = await calibrationRepository.cancelOpenCommand(id);
  res.json(cancelled ?? (await calibrationRepository.findLatestCommand(id)));
});

nodesRouter.patch('/:id', requireCapability(Capability.MANAGE_USERS), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const changes = updateNodeBody.parse(req.body);

  const node = await nodesRepository.updateNode(id, changes);
  if (!node) throw notFound('Node');

  await invalidateNamespaces([cacheNamespaces.NODES]);
  res.json(node);
});

/**
 * Raises an alert against a node from the field, for anything the sensors cannot
 * see themselves: a cracked bucket, a chewed cable, a tap that has dried up.
 */
nodesRouter.post('/:id/flag', requireCapability(Capability.FLAG_NODE), async (req, res) => {
  const id = idParam.parse(req.params.id);
  const { type, description } = flagNodeBody.parse(req.body ?? {});

  const node = await nodesRepository.findNodeById(id);
  if (!node) throw notFound('Node');

  const alert = await alertsRepository.createAlert({
    NodeID: id,
    Alert_Type: type,
    Description: description ?? `${node.Node_Name} flagged for review.`,
    severity: 'warning',
  });

  await invalidateNamespaces([cacheNamespaces.ALERTS, cacheNamespaces.NODES]);
  res.status(201).json(alert);
});
