/**
 * Express application assembly.
 *
 * Routes mount at the ROOT, not under /api. nginx owns the /api prefix and
 * strips it before proxying:
 *
 *   location ~ ^/api/(.*)$ { proxy_pass $api_upstream/$1$is_args$args; }
 *
 * so the browser calls /api/metrics and this app sees /metrics. Mounting under
 * /api here would produce /api/api/metrics in Docker while working fine when hit
 * directly, which is a confusing way to find out.
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';

import { config } from './config.js';
import { logger } from './lib/logger.js';
import { attachUser } from './middleware/authenticate.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { cacheStatus } from './cache/redisCache.js';
import { pool } from './db/pool.js';

import { authRouter } from './routes/auth.js';
import { referenceRouter } from './routes/reference.js';
import { nodesRouter } from './routes/nodes.js';
import { metricsRouter } from './routes/metrics.js';
import { alertsRouter } from './routes/alerts.js';
import { collectionLogsRouter } from './routes/collectionLogs.js';
import { usersRouter } from './routes/users.js';
import { scheduleRouter } from './routes/schedule.js';
import { weatherRouter } from './routes/weather.js';
import { journalRouter } from './routes/journal.js';
import { settingsRouter } from './routes/settings.js';

export function createApp() {
  const app = express();

  // Behind nginx: needed for req.protocol and the client IP to be the real ones,
  // which `secure` cookies and rate limiting depend on.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      // Health checks would otherwise dominate the log at one line per probe.
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );

  // This API serves JSON only; the CSP defaults aimed at HTML documents would
  // just be noise on these responses.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

  app.use(
    cors({
      // Reflect only known origins. A wildcard is not even legal alongside
      // credentials, and the session rides in a cookie.
      origin(origin, callback) {
        if (!origin) return callback(null, true); // same-origin or curl
        if (config.corsOrigins.includes(origin)) return callback(null, true);
        callback(null, false);
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  // Liveness, before auth so an unauthenticated probe still works.
  app.get('/health', async (req, res) => {
    let database = false;
    try {
      await pool.query('select 1');
      database = true;
    } catch {
      database = false;
    }

    const cache = cacheStatus();
    // Redis being down is degraded, not unhealthy: the API still serves.
    res.status(database ? 200 : 503).json({
      status: database ? 'ok' : 'unhealthy',
      database,
      cache,
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  // Resolves the session for every route below without requiring one.
  app.use(attachUser);

  app.use('/auth', authRouter);
  app.use(referenceRouter);
  app.use('/nodes', nodesRouter);
  app.use('/metrics', metricsRouter);
  app.use('/alerts', alertsRouter);
  app.use('/collection-logs', collectionLogsRouter);
  app.use('/users', usersRouter);
  app.use('/schedule', scheduleRouter);
  app.use('/weather', weatherRouter);
  app.use('/journal', journalRouter);
  app.use('/settings', settingsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
