import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import axios from 'axios';
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
import { registerRoutes } from './routes';

export const createApp = (): express.Application => {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(compressionMiddleware);
  app.use(
    cors({
      origin: config.CORS_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id', 'x-request-id'],
    }),
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(requestIdMiddleware);
  app.use(correlationId);
  app.use(requestLogger);

  app.use(
    rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: config.RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: {
        success: false,
        error: { code: 'RATE_LIMIT_ERROR', message: 'Too many requests. Please try again later.' },
      },
    }),
  );

  // Standardized Health, Readiness, and Version Endpoints
  const { healthHandler, readinessHandler, versionHandler } = createHealthHandlers({
    serviceName: 'gateway',
    version: '1.0.0',
    getReadinessStatus: async () => {
      const services = [
        { name: 'auth-service', url: `${config.AUTH_SERVICE_URL}/health` },
        { name: 'consumer-service', url: `${config.CONSUMER_SERVICE_URL}/health` },
        { name: 'document-service', url: `${config.DOCUMENT_SERVICE_URL}/health` },
        { name: 'notification-service', url: `${config.NOTIFICATION_SERVICE_URL}/health` },
      ];

      const checks = await Promise.allSettled(
        services.map(async (s) => {
          const res = await axios.get(s.url, { timeout: 3000 });
          return { name: s.name, status: res.status === 200 ? 'UP' : 'DOWN' };
        }),
      );

      const details: Record<string, string> = {};
      let allReady = true;

      checks.forEach((result, idx) => {
        const serviceName = services[idx]?.name || `service-${idx}`;
        if (result.status === 'fulfilled') {
          details[serviceName] = result.value.status;
        } else {
          details[serviceName] = 'DOWN';
          allReady = false;
        }
      });

      return { ready: allReady, details };
    },
  });

  app.get('/health', healthHandler);
  app.get('/ready', readinessHandler);
  app.get('/version', versionHandler);

  registerRoutes(app);

  app.use(notFound);
  app.use(globalErrorHandler);

  return app;
};
