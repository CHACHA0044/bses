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

/** In-process hit counter for the /ping keep-alive endpoint (replaces Redis INCR). */
let pingHits = 0;

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

  // Self-ping keep-alive: an external cron (e.g. UptimeRobot or a GitHub Action)
  // hits /ping every few minutes so Render (and similar PaaS) does NOT spin down
  // the instance after the no-traffic idle window. Without this, cold starts on
  // real user traffic add several seconds of latency.
  //
  // Design goals for this endpoint:
  //   - Do enough varied CPU work that a passive observer can confirm the event
  //     loop actually executed (not a cached/static response).
  //   - Surface the gateway's own health (process snapshot) plus the supervisor
  //     IPC-reported state of the child services, so a /ping call is also a
  //     lightweight liveness check of the whole stack.
  //   - Vary iteration count + operation + response message per call so the
  //     response signature is not trivially cacheable / scrapable.
  //   - Stay dependency-free (no Redis / Mongoose in the gateway) — the gateway
  //     already has a cheap, fast path; we deliberately do not introduce new
  //     infra here, just exercise the event loop harder.
  app.get('/ping', (_req, res) => {
    try {
      const started = Date.now();

      // Randomized CPU work: 500-2000 iterations, one of 5 operations chosen at
      // random per request. Different operation + different count each time means
      // a static scraper can't fingerprint the response.
      const iterations = Math.floor(500 + Math.random() * 1500);
      const operations: Array<(i: number, r: number) => number> = [
        (i, r) => Math.sqrt(i * r),
        (i, r) => Math.pow(i, r % 3),
        (i, r) => Math.log(i + 1) * r,
        (i, r) => Math.sin(i) * Math.cos(r * i),
        (i, r) => (i * r) % 997, // prime modulo for extra entropy
      ];
      // Pick a random operation. We assert non-undefined for the type checker —
      // `Math.floor(Math.random() * operations.length)` is always a valid index
      // because the index range is [0, length - 1].
      const opIndex = Math.floor(Math.random() * operations.length);
      const operation = operations[opIndex] ?? operations[0]!;
      const cpuSample = Array.from({ length: iterations }, (_, i) => operation(i, Math.random())).reduce(
        (a, b) => a + b,
        0,
      );

      // Process snapshot — useful to confirm the same instance answered (pid
      // + uptime) and that memory is stable (no leak on the keep-alive path).
      const snapshot = {
        pid: process.pid,
        uptime: process.uptime(),
        rss: process.memoryUsage().rss,
        timestamp: started,
      };

      // Lightweight in-process hit counter. This replaces the example's Redis
      // INCR — the gateway doesn't depend on Redis, and a counter here is plenty
      // for proving the endpoint is being polled (it's a monotonic signal that
      // survives across requests inside this process).
      pingHits += 1;

      // Pull supervisor-reported child-service state via IPC. Under the BSES
      // supervisor this reflects live readiness of auth / consumer / document /
      // notification without opening any new ports. When the gateway runs
      // standalone (no IPC), we degrade to a 'unknown' status — the ping is still
      // useful as a warm-up signal.
      const supervisor = getSupervisorStatus();
      const childServices = supervisor
        ? supervisor.services.reduce<Record<string, string>>((acc, s) => {
            acc[s.name] = s.state;
            return acc;
          }, {})
        : null;

      // Vary the response message so a passive scraper can't trivially identify
      // /ping as a static response (e.g. for "is this a real backend?" checks).
      const messages = [
        `Server is awake and did calculations...${iterations.toLocaleString()}`,
        `Good evening, Colonel. Can I give you a lift? ${iterations.toLocaleString()}`,
        `Pong. ${iterations.toLocaleString()} ops executed.`,
        `Still here. ${iterations.toLocaleString()} iterations this round.`,
        `Keep-alive heartbeat: ${iterations.toLocaleString()} ops, instance ${snapshot.pid}.`,
      ];
      const message = messages[Math.floor(Math.random() * messages.length)];

      sendSuccess(res, {
        pong: true,
        message,
        cpuSample: cpuSample.toFixed(2),
        iterations,
        pingHits,
        snapshot,
        services: childServices,
        supervisor: supervisor
          ? {
              pid: supervisor.supervisor.pid,
              uptimeSeconds: supervisor.supervisor.uptimeSeconds,
              state: supervisor.supervisor.state,
            }
          : null,
        elapsedMs: Date.now() - started,
        timestamp: new Date(started).toISOString(),
      });
    } catch (err) {
      // /ping must never 5xx — a failing keep-alive defeats its own purpose. Log
      // and return a minimal pong so the external monitor keeps hitting the URL.
      // eslint-disable-next-line no-console
      console.error('[/ping] unexpected error:', err);
      try {
        res.status(200).json({
          success: true,
          data: { pong: true, degraded: true, error: err instanceof Error ? err.message : 'unknown' },
        });
      } catch {
        /* response already sent */
      }
    }
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
