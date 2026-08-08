import { createApp } from './app';
import { config } from './config';
import { createLogger } from '@bses/shared';

const logger = createLogger({ service: 'notification-service' });

const start = async (): Promise<void> => {
  const app = createApp();

  const server = app.listen(config.PORT, () => {
    logger.info('Notification service running', { port: config.PORT, env: config.NODE_ENV });
  });

  const shutdown = (signal: string): void => {
    logger.info(`${signal} received — shutting down`);
    server.close(() => process.exit(0));
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((err: unknown) => {
  console.error('Fatal: Notification service failed to start', err);
  process.exit(1);
});
