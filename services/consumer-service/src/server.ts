import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { createLogger } from '@bses/shared';
import { connectDatabase, disconnectDatabase } from './db/db.client';

const logger = createLogger({ service: 'consumer-service' });

const start = async (): Promise<void> => {
  try {
    await connectDatabase();
    logger.info('🗄️ PostgreSQL connected');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`⚠️ PostgreSQL connection deferred | reason=${msg}`);
  }

  const app = createApp();

  const server = app.listen(config.PORT, '127.0.0.1', () => {
    logger.info(`🚀 Consumer service ready | port=${config.PORT} | env=${config.NODE_ENV}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`🛑 ${signal} received — shutting down Consumer service`);
    server.close(async () => {
      await disconnectDatabase();
      logger.info('✅ Consumer service shut down');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((err: unknown) => {
  logger.error(`❌ Consumer service failed to start | error=${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
