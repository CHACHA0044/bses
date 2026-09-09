import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { createLogger } from '@bses/shared';
import { connectDatabase, disconnectDatabase } from './db/db.client';

const logger = createLogger({ service: 'auth-service' });

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
    logger.info(`🚀 Auth service ready | port=${config.PORT} | env=${config.NODE_ENV}`);
  });

  process.on('SIGTERM', () => logger.info('📡 SIGTERM received — keeping Auth service running 24/7'));
  process.on('SIGINT', () => logger.info('📡 SIGINT received — keeping Auth service running 24/7'));
};

start().catch((err: unknown) => {
  logger.error(`❌ Auth service failed to start | error=${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
