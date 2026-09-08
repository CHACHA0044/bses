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
  createLogger,
} from '@bses/shared';
import { config } from './config';
import { registerRoutes } from './routes';
import { getSupervisorStatus } from './supervisorStatus';

const logger = createLogger({ service: 'gateway' });

/**
 * How often (ms) the readiness probe checks upstream services.
 * Kept at 60s — frequent enough for Render health checks, sparse enough
 * to avoid constant axios allocations.
 */
const READY_PROBE_INTERVAL_MS = 60_000;
let lastReadyProbeAt = 0;
let cachedReadyStatus: { ready: boolean; details: Record<string, string> } | null = null;

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
      // Prefer IPC supervisor status (zero-allocation, already pushed) when fresh.
      const supervisor = getSupervisorStatus();
      if (supervisor) {
        const allReady = supervisor.services.every(
          (s) => s.state === 'running' && s.ready,
        );
        if (allReady) {
          const details: Record<string, string> = {};
          for (const s of supervisor.services) {
            details[s.name] = 'UP';
          }
          return { ready: true, details };
        }
      }

      // Fallback: live probe upstream services (only when IPC status is stale/absent)
      const now = Date.now();
      if (cachedReadyStatus && now - lastReadyProbeAt < READY_PROBE_INTERVAL_MS) {
        return cachedReadyStatus;
      }

      const services = [
        { name: 'auth-service', url: `${config.AUTH_SERVICE_URL}/ready` },
        { name: 'consumer-service', url: `${config.CONSUMER_SERVICE_URL}/ready` },
        { name: 'document-service', url: `${config.DOCUMENT_SERVICE_URL}/ready` },
        { name: 'notification-service', url: `${config.NOTIFICATION_SERVICE_URL}/ready` },
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

      cachedReadyStatus = { ready: allReady, details };
      lastReadyProbeAt = now;
      return cachedReadyStatus;
    },
  });

  app.get('/health', healthHandler);
  app.get('/ready', readinessHandler);
  app.get('/version', versionHandler);

  // Lightweight keep-alive endpoint for the server-side loop in keepAlive.ts.
  // Deliberately extremely simple: a bare HTTP 200 JSON — no counters, no DB
  // calls, no CPU work, no retained state. Each hit stays visible in the HTTP
  // request logs (requestLogger does not skip /ping). It can only be reached
  // while the gateway process is actually running; it cannot wake a Render
  // container after Render has suspended it.
  app.get('/ping', (_req, res) => {
    res.status(200).json({ pong: true, status: 'ok' });
  });

  // Aggregated status: gateway + supervisor + every internal service.
  // IPC supervisor status is preferred (zero-allocation); live probes are
  // only performed when IPC data is stale or absent.
  app.get('/health/services', async (_req, res) => {
    const supervisor = getSupervisorStatus();

    // If we have fresh IPC status (< 60s old), use it directly
    if (supervisor && supervisor.supervisor.uptimeSeconds < 120) {
      const services: Record<string, string> = {};
      for (const s of supervisor.services) {
        services[s.name] = s.state === 'running' && s.ready ? 'healthy' : s.state;
      }
      const allHealthy = Object.values(services).every((s) => s === 'healthy');
      sendSuccess(res, {
        status: allHealthy ? 'ok' : 'degraded',
        service: 'gateway',
        timestamp: new Date().toISOString(),
        supervisor: {
          pid: supervisor.supervisor.pid,
          uptimeSeconds: supervisor.supervisor.uptimeSeconds,
          state: supervisor.supervisor.state,
        },
        services,
      });
      return;
    }

    // Fallback: live probe all upstreams
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
