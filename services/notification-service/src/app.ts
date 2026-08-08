import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import {
  correlationId,
  requestIdMiddleware,
  requestLogger,
  compressionMiddleware,
  notFound,
  globalErrorHandler,
  createHealthHandlers,
} from '@bses/shared';
import { config } from './config';
import notificationRouter from './routes';

export const createApp = (): express.Application => {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(compressionMiddleware);
  app.use(cors({ origin: config.CORS_ORIGINS, credentials: true }));
  app.use(express.json());

  app.use(requestIdMiddleware);
  app.use(correlationId);
  app.use(requestLogger);

  const { healthHandler, readinessHandler, versionHandler } = createHealthHandlers({
    serviceName: 'notification-service',
    version: '1.0.0',
  });

  app.get('/health', healthHandler);
  app.get('/ready', readinessHandler);
  app.get('/version', versionHandler);

  app.use('/api/notifications', notificationRouter);

  app.use(notFound);
  app.use(globalErrorHandler);

  return app;
};
