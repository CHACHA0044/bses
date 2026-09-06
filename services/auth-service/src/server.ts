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

  const server = app.listen(config.PORT, '127.0.0.1', () => {
    logger.info('Auth service running', { port: config.PORT, env: config.NODE_ENV });
  });

  process.on('SIGTERM', () => logger.info('SIGTERM received — keeping Auth service running 24/7 (shutdown ignored)'));
  process.on('SIGINT', () => logger.info('SIGINT received — keeping Auth service running 24/7 (shutdown ignored)'));
};

start().catch((err: unknown) => {
  console.error('Fatal: Auth service failed to start', err);
  process.exit(1);
});
