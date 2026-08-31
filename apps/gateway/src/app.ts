import express from 'express';
import type { IncomingMessage } from 'node:http';
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
  sendSuccess,
  isAllowedOrigin,
} from '@bses/shared';
import { config } from './config';
import { registerRoutes } from './routes';
import { getSupervisorStatus } from './supervisorStatus';

export const createApp = (): express.Application => {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(compressionMiddleware);
  // CORS policy: localhost, any *.vercel.app, plus explicit CORS_ORIGINS env list.
  // The shared isAllowedOrigin helper is also used by the proxy response handler
  // (routes/index.ts) so the policy is identical on direct and proxied responses.
  app.use(
    cors({
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin ?? undefined, config.CORS_ORIGINS)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id', 'x-request-id'],
    }),
  );

  // Body parsers are scoped to their exact content type so multipart/form-data
  // uploads are NEVER buffered or consumed before they reach the proxy — the
  // raw request stream must pass straight through to the upstream service.
  // Express's default type matching already skips multipart, but making it
  // explicit protects the upload route from any parser change or re-serialization.
  const isJsonRequest = (req: IncomingMessage): boolean =>
    /^application\/(.+\+)?json\b/i.test(req.headers['content-type'] ?? '');

  const isUrlEncodedRequest = (req: IncomingMessage): boolean =>
    /^application\/x-www-form-urlencoded\b/i.test(req.headers['content-type'] ?? '');

  app.use(express.json({ limit: '10mb', type: isJsonRequest }));
  app.use(express.urlencoded({ extended: true, type: isUrlEncodedRequest }));

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

  // Self-ping keep-alive: a cheap /ping endpoint that does a small CPU + memory
  // workout and returns. Render (and similar PaaS) spin down free/cheap
  // instances after a few minutes of no traffic. An external cron (e.g. an
  // UptimeRobot monitor or GitHub Action) hitting /ping every 3 minutes keeps
  // the service warm and avoids cold-start delays on real user traffic.
  // The light "work" is a checksum over a process-snapshot string so a passive
  // observability tool can confirm the request actually exercised the event loop
  // (and didn't just hit a static cache).
  app.get('/ping', (_req, res) => {
    const started = Date.now();
    const snapshot = JSON.stringify({
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage().rss,
      timestamp: started,
    });
    let hash = 0;
    for (let i = 0; i < snapshot.length; i++) {
      hash = (hash * 31 + snapshot.charCodeAt(i)) | 0;
    }
    sendSuccess(res, {
      pong: true,
      checksum: hash,
      elapsedMs: Date.now() - started,
      timestamp: new Date(started).toISOString(),
    });
  });

  // Aggregated status: gateway + supervisor + every internal service. The
  // supervisor pushes per-service state via IPC when running under the BSES
  // supervisor; live loopback probes are always performed as ground truth, so
  // the endpoint remains useful even when the gateway runs standalone.
  app.get('/health/services', async (_req, res) => {
    const upstreams = [
      { name: 'auth', url: `${config.AUTH_SERVICE_URL}/health` },
      { name: 'consumer', url: `${config.CONSUMER_SERVICE_URL}/health` },
      { name: 'document', url: `${config.DOCUMENT_SERVICE_URL}/health` },
      { name: 'notification', url: `${config.NOTIFICATION_SERVICE_URL}/health` },
    ];

    const results = await Promise.allSettled(
      upstreams.map(async (u) => {
        const probe = await axios.get(u.url, { timeout: 3000 });
        return { name: u.name, status: probe.status === 200 ? 'healthy' : 'unhealthy' };
      }),
    );

    const live: Record<string, string> = {};
    results.forEach((r, i) => {
      const name = upstreams[i]?.name ?? `service-${i}`;
      if (r.status === 'fulfilled') live[name] = r.value.status;
      else live[name] = 'down';
    });

    const supervisor = getSupervisorStatus();

    const services: Record<string, string> = {};
    for (const [name, liveStatus] of Object.entries(live)) {
      const reported = supervisor?.services.find((s) => s.name === name);
      services[name] =
        reported && liveStatus === 'down'
          ? reported.state === 'running'
            ? 'unhealthy'
            : reported.state
          : liveStatus;
    }

    const allHealthy = Object.values(services).every((s) => s === 'healthy');

    sendSuccess(res, {
      status: allHealthy ? 'ok' : 'degraded',
      service: 'gateway',
      timestamp: new Date().toISOString(),
      supervisor: supervisor
        ? {
            pid: supervisor.supervisor.pid,
            uptimeSeconds: supervisor.supervisor.uptimeSeconds,
            state: supervisor.supervisor.state,
          }
        : null,
      services,
    });
  });

  registerRoutes(app);

  app.use(notFound);
  app.use(globalErrorHandler);

  return app;
};
