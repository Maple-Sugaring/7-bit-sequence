/**
 * Records every routed API request as an activity event once its response is
 * sent (FR-036): GET as a read, anything else as a write, with the route
 * template, the entity from the path, status, duration and caller.
 *
 * Routes that record a richer event of their own (GET /metrics, ingest, the
 * trace view) call requestActivity(req), which marks the request so this does
 * not add a second row. Query values pass through activityDetail; request
 * bodies are never read here.
 */

import { activityDetail } from '../business/activity.js';
import { recordActivity } from '../services/activityService.js';

/** First path segment → what an `:id` in that router names. */
const ENTITY_BY_BASE = {
  '/nodes': 'node',
  '/metrics': 'metric',
  '/alerts': 'alert',
  '/collection-logs': 'collection_log',
  '/collections': 'collection',
  '/users': 'user',
  '/schedule': 'schedule_slot',
  '/journal': 'journal_entry',
  '/notifications': 'notification',
  '/audit-events': 'audit_event',
};

// Login and OAuth callbacks carry one-time codes in the query, and health
// probes would bury everything else.
const SKIP_BASES = new Set(['/auth']);
const SKIP_PATHS = new Set(['/health']);

/** Every router app.js mounts, for when Express has already cleared baseUrl. */
const MOUNTS = new Set([
  ...Object.keys(ENTITY_BY_BASE),
  '/auth', '/ingest', '/activity-events', '/weather', '/settings', '/profile',
]);

function pathOf(req) {
  return String(req.originalUrl ?? '').split('?')[0];
}

/**
 * The router a request went to. Express clears baseUrl (and params) when a
 * thrown error leaves the router for the error handler, so a failed request
 * falls back to the URL itself.
 */
function baseOf(req) {
  if (req.baseUrl) return req.baseUrl;
  const first = `/${pathOf(req).split('/')[1] ?? ''}`;
  return MOUNTS.has(first) ? first : '';
}

/** Route params, re-read from the URL when the error path dropped them. */
function paramsOf(req, base) {
  if (req.params && Object.keys(req.params).length) return req.params;
  const pattern = String(req.route?.path ?? '').split('/');
  const actual = pathOf(req).slice(base.length).split('/');
  if (pattern.length !== actual.length) return {};
  const params = {};
  pattern.forEach((segment, index) => {
    if (segment.startsWith(':')) params[segment.slice(1)] = decodeURIComponent(actual[index]);
  });
  return params;
}

function routeTemplate(req, base) {
  const routePath = req.route?.path ?? '';
  return `${base}${routePath === '/' && base ? '' : routePath}` || req.path;
}

function numericId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function outcomeFor(status) {
  if (status >= 500) return 'failed';
  if (status >= 400) return 'rejected';
  return 'ok';
}

/** The activity event a finished request should produce, or null to skip. */
export function requestEvent(req, res, durationMs) {
  if (req.activityRecorded) return null;
  // Unrouted paths (404s, scanners) have no template worth keeping.
  if (!req.route) return null;
  const base = baseOf(req);
  if (SKIP_PATHS.has(req.path) || SKIP_BASES.has(base)) return null;

  const entityType = ENTITY_BY_BASE[base] ?? null;
  const entityId = entityType ? numericId(paramsOf(req, base).id) : null;
  const queryNode = numericId(req.query?.nodeId);

  return {
    requestId: req.id ?? null,
    receivedAt: req.receivedAt ?? null,
    actorUserId: req.user?.UserID ?? null,
    kind: req.method === 'GET' || req.method === 'HEAD' ? 'read' : 'write',
    operation: `${req.method} ${routeTemplate(req, base)}`,
    outcome: outcomeFor(res.statusCode),
    entityType: entityId ? entityType : null,
    entityId,
    nodeId: entityType === 'node' && entityId ? entityId : queryNode,
    durationMs: Math.round(durationMs),
    detail: { status: res.statusCode, query: activityDetail(req.query ?? {}) },
  };
}

export function activityRecorder(req, res, next) {
  const started = performance.now();
  res.on('finish', () => {
    const event = requestEvent(req, res, performance.now() - started);
    if (event) void recordActivity(event);
  });
  next();
}
