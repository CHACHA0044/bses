import 'dotenv/config';
import http from 'node:http';
import { createApp } from './app';
import { config } from './config';
import { createLogger } from '@bses/shared';
import { setSupervisorStatus } from './supervisorStatus';

const logger = createLogger({ service: 'gateway' });

/**
 * When run under the BSES supervisor (single-render-service mode), the gateway
 * receives aggregated service-status pushes over IPC so its public
 * /health/services endpoint can report supervisor + per-service state. When the
 * gateway runs standalone (e.g. local `npm run dev`), IPC is absent and the
 * endpoint degrades to live-upstream probing only.
 */
const installIpc = (): void => {
  if (typeof process.send !== 'function') return;

  process.on('message', (message: unknown) => {
    if (!message || typeof message !== 'object') return;
    const msg = message as { type?: string; payload?: unknown };
    if (msg.type === 'SUPERVISOR_STATUS') {
      setSupervisorStatus(msg.payload as never);
    }
  });

  setImmediate(() => {
    try {
      process.send?.({ type: 'GATEWAY_REQUESTS_STATUS' });
    } catch {
      /* IPC unavailable */
    }
  });
};

/**
 * Self-polling keep-alive.
 *
 * Render (and similar free PaaS) spin down instances after a few minutes of no
 * traffic. An external cron (UptimeRobot / GitHub Action) hitting /ping is one
 * way to keep the service warm, but it depends on that external monitor being
 * configured and running. This function makes the gateway keep itself warm
 * regardless: every SELF_PING_INTERVAL_MS it issues a loopback HTTP GET to its
 * own /ping endpoint, exercising the event loop and keeping the idle timer
 * reset so the instance never goes to sleep.
 *
 * The loopback call is fire-and-forget — failures are logged at debug level and
 * never crash the process (a failing keep-alive defeats its own purpose).
 */
const installSelfPing = (port: number): NodeJS.Timeout => {
  const intervalMs = Number(process.env.SELF_PING_INTERVAL_MS) || 180 * 1000; // 3 min keep-alive interval
  const url = `http://127.0.0.1:${port}/ping`;

  const ping = (): void => {
    const req = http
      .get(url, { timeout: 3000 }, (res) => {
        res.resume();
        res.on('end', () => {
          logger.debug('Gateway Self-Ping Keep-Alive OK', { url, status: res.statusCode });
        });
      })
      .on('error', (err) => {
        logger.warn('Self-ping failed (non-fatal)', { url, error: err.message });
      })
      .on('timeout', () => {
        logger.warn('Self-ping timed out (non-fatal)', { url });
        req.destroy();
      });
  };

  // Fire the first ping shortly after the server is listening
  setTimeout(ping, 1000);
  logger.info('Self-ping keep-alive installed', { url, intervalMs });
  return setInterval(ping, intervalMs);
};

const start = async (): Promise<void> => {
  installIpc();
  const app = createApp();

  const server = app.listen(config.PORT, () => {
    logger.info('Gateway running', { port: config.PORT, env: config.NODE_ENV });
  });

  const selfPingTimer = installSelfPing(config.PORT);

  process.on('SIGTERM', () => logger.info('SIGTERM received — keeping Gateway running 24/7 (shutdown ignored)'));
  process.on('SIGINT', () => logger.info('SIGINT received — keeping Gateway running 24/7 (shutdown ignored)'));
};

start().catch((err: unknown) => {
  console.error('Fatal: Gateway failed to start', err);
  process.exit(1);
});
