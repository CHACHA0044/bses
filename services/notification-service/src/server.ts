import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { createLogger } from '@bses/shared';
import { connectDatabase, disconnectDatabase } from './db/db.client';

const logger = createLogger({ service: 'notification-service' });

const start = async (): Promise<void> => {
  try {
    await connectDatabase().catch((err) => {
      logger.warn(`PostgreSQL initial connection skipped: ${err.message}`);
    });
  } catch (err: unknown) {
    logger.warn('Notification Service starting with uninitialized database connection.');
  }

  const app = createApp();

  const server = app.listen(config.PORT, '127.0.0.1', () => {
    logger.info('Notification service running', { port: config.PORT, env: config.NODE_ENV });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down Notification service gracefully`);
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Notification service server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((err: unknown) => {
  console.error('Fatal: Notification service failed to start', err);
  process.exit(1);
});
