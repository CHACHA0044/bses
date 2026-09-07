import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { createLogger } from '@bses/shared';
import { connectDatabase, disconnectDatabase } from './db/db.client';

const logger = createLogger({ service: 'consumer-service' });

const start = async (): Promise<void> => {
  try {
    await connectDatabase().catch((err) => {
      logger.warn(`PostgreSQL initial connection skipped: ${err.message}`);
    });
  } catch (err: unknown) {
    logger.warn('Consumer Service starting with uninitialized database connection.');
  }

  const app = createApp();

  const server = app.listen(config.PORT, '127.0.0.1', () => {
    logger.info('Consumer service running', { port: config.PORT, env: config.NODE_ENV });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down Consumer service gracefully`);
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Consumer service server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((err: unknown) => {
  console.error('Fatal: Consumer service failed to start', err);
  process.exit(1);
});
