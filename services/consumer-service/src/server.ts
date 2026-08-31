import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { createLogger } from '@bses/shared';

const logger = createLogger({ service: 'consumer-service' });

const start = async (): Promise<void> => {
  const app = createApp();

  const server = app.listen(config.PORT, () => {
    logger.info('Consumer service running', { port: config.PORT, env: config.NODE_ENV });
  });

  const shutdown = (signal: string): void => {
    logger.info(`${signal} received — shutting down Consumer service gracefully`);
    server.close(() => {
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
