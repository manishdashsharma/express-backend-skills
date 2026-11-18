import app from './app.js';
import config from './config/index.js';
import { logger } from './shared/index.js';
import { connectDatabases, disconnectDatabases } from './config/databases.js';
import { disconnectRedis } from './config/redis.js';

const SHUTDOWN_TIMEOUT_MS = 30000;

const start = async () => {
  await connectDatabases();

  const server = app.listen(config.port, () => {
    logger.info(`Server listening on port ${config.port}`, { env: config.env });
  });

  server.on('error', (error) => {
    logger.error('Server error', { error: error.message, code: error.code });
    process.exit(1);
  });

  const shutdown = (signal) => {
    logger.warn(`Received ${signal}, shutting down`);
    server.close(async () => {
      try {
        await Promise.all([disconnectDatabases(), disconnectRedis()]);
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Shutdown failed', { error: error.message });
        process.exit(1);
      }
    });
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((error) => {
  logger.error('Failed to start server', { error: error.message, stack: error.stack });
  process.exit(1);
});
