import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { createLogger } from '@bses/shared';

const logger = createLogger({ service: 'notification-service' });

const start = async (): Promise<void> => {
  const app = createApp();

  const server = app.listen(config.PORT, '127.0.0.1', () => {
    logger.info('Notification service running', { port: config.PORT, env: config.NODE_ENV });
  });

  process.on('SIGTERM', () => logger.info('SIGTERM received — keeping Notification service running 24/7 (shutdown ignored)'));
  process.on('SIGINT', () => logger.info('SIGINT received — keeping Notification service running 24/7 (shutdown ignored)'));
};

start().catch((err: unknown) => {
  console.error('Fatal: Notification service failed to start', err);
  process.exit(1);
});
