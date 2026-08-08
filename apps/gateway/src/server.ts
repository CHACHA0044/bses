import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { createLogger } from '@bses/shared';

const logger = createLogger({ service: 'gateway' });

const start = async (): Promise<void> => {
  const app = createApp();

  const server = app.listen(config.PORT, () => {
    logger.info('Gateway running', { port: config.PORT, env: config.NODE_ENV });
  });

  const shutdown = (signal: string): void => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(() => {
      logger.info('Gateway closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((err: unknown) => {
  console.error('Fatal: Gateway failed to start', err);
  process.exit(1);
});
