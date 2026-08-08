import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { createLogger } from '@bses/shared';
import { connectDatabase, disconnectDatabase } from './db/db.client';

const logger = createLogger({ service: 'auth-service' });

const start = async (): Promise<void> => {
  try {
    // Attempt database connection on startup (retry logic enabled)
    await connectDatabase().catch((err) => {
      logger.warn(`PostgreSQL initial connection skipped in dev mode: ${err.message}`);
    });
  } catch (err: unknown) {
    logger.warn('Auth Service starting with uninitialized database connection.');
  }

  const app = createApp();

  const server = app.listen(config.PORT, () => {
    logger.info('Auth service running', { port: config.PORT, env: config.NODE_ENV });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down Auth service gracefully`);
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Auth service server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((err: unknown) => {
  console.error('Fatal: Auth service failed to start', err);
  process.exit(1);
});
