/**
 * Process entry point: boot ordering and graceful shutdown.
 */

import { config } from './config.js';
import { logger } from './lib/logger.js';
import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { connectCache, disconnectCache } from './cache/redisCache.js';
import { closePool } from './db/pool.js';
import { ensureHistoricWeather } from './services/historicWeather.js';
import * as usersRepository from './repositories/usersRepository.js';

// Migrations run before the server listens, so a container that rolls out ahead
// of its schema fails to start rather than serving 500s against missing columns.
await runMigrations();

const promoted = await usersRepository.promoteEmailsToAdmin(config.bootstrapAdminEmails);
if (promoted) logger.info({ promoted }, 'Promoted bootstrap administrators');

await ensureHistoricWeather();

// Not awaited as a hard requirement: the cache is optional by design, and a
// Redis outage must not stop the API from coming up.
await connectCache();

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.env, redirectUri: config.google.redirectUri },
    'Maple Sugar API listening',
  );
});

let shuttingDown = false;

async function shutdown(signal) {
  // A second Ctrl-C should not start a parallel teardown.
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'Shutting down');

  // Stop accepting connections, then let in-flight requests finish before the
  // pool goes away underneath them.
  server.close(async () => {
    try {
      await disconnectCache();
      await closePool();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  });

  // Backstop for a connection that never closes, e.g. a hung keep-alive.
  setTimeout(() => {
    logger.warn('Forcing shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection');
});
