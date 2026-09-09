import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { createLogger } from '@bses/shared';
import { setSupervisorStatus } from './supervisorStatus';
import { startKeepAlive } from './keepAlive';

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

const start = async (): Promise<void> => {
  installIpc();
  const app = createApp();

  const server = app.listen(config.PORT, () => {
    logger.info(`🚀 BSES Gateway started | port=${config.PORT} | env=${config.NODE_ENV}`);
  });

  const keepAlive = startKeepAlive();

  const onSignal = (signal: string): void => {
    logger.info(`📡 ${signal} received — keeping Gateway running 24/7`);
    keepAlive.stop();
  };

  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('SIGINT', () => onSignal('SIGINT'));
};

start().catch((err: unknown) => {
  logger.error(`❌ Gateway failed to start | error=${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
