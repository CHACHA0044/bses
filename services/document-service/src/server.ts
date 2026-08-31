import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { createLogger } from '@bses/shared';
import { connectMongoDB, disconnectMongoDB } from './db/mongo.client';

const logger = createLogger({ service: 'document-service' });

const start = async (): Promise<void> => {
  try {
    await connectMongoDB({
      uri: config.MONGODB_URI,
      bucketName: config.GRIDFS_BUCKET,
    }).catch((err) => {
      logger.warn(`MongoDB GridFS initial connection skipped in dev mode: ${err.message}`);
    });
  } catch (err: unknown) {
    logger.warn('Document Service starting with uninitialized MongoDB GridFS connection.');
  }

  const app = createApp();

  const server = app.listen(config.PORT, () => {
    logger.info('Document service running', { port: config.PORT, env: config.NODE_ENV });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down Document service gracefully`);
    server.close(async () => {
      await disconnectMongoDB();
      logger.info('Document service server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((err: unknown) => {
  console.error('Fatal: Document service failed to start', err);
  process.exit(1);
});
