import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import axios from 'axios';
import { createLogger } from '@bses/shared';
import { config } from './config';

const logger = createLogger({ service: 'keepalive' });

/** Cron expression — fires at :00/:03/:06/... every hour, every day. */
export const SCHEDULE = '*/3 * * * *';

/** Short timeout so a stalled request can never hold a socket or block a tick forever. */
const REQUEST_TIMEOUT_MS = 10_000;

export interface KeepAliveHandle {
  stop(): void;
}

let activeHandle: KeepAliveHandle | null = null;

/**
 * ONE keep-alive scheduler for the whole backend, started once when the gateway
 * boots and never duplicated within the same process (module-level singleton).
 *
 * Unlike a local loopback ping, this scheduler uses node-cron to issue a real
 * HTTP request to the PUBLIC Render URL every 3 minutes. The request enters
 * through Render's public ingress and shows up in Render's logs as genuine
 * inbound traffic (GET /ping -> 200). The target comes from KEEPALIVE_URL so
 * the deploy config controls exactly where the pings go.
 *
 * Honest limitation: this cron runs INSIDE the Render process. It can only fire
 * while that process is running — it CANNOT wake a Render Free instance that
 * Render has already suspended, because Render halts the entire container
 * (timers and all) and only external inbound traffic can bring it back. What it
 * DOES do is keep an already-running process continuously warm by generating a
 * public request every 3 minutes, giving proof in Render's log stream.
 *
 * Abuse / footprint notes: one tiny unauthenticated GET every 3 minutes; no
 * Redis, no Prisma, no MongoDB, no CPU work, no OCR, and nothing retained in
 * memory between ticks. node-cron's `noOverlap` guarantees that a slow request
 * can never cause overlapping pings, and `unref` keeps the timer from holding
 * the process open after shutdown.
 */
export const startKeepAlive = (): KeepAliveHandle => {
  if (activeHandle) return activeHandle;

  const url = config.KEEPALIVE_URL;

  const ping = async (): Promise<void> => {
    const startedAt = Date.now();
    try {
      logger.info(`[KEEPALIVE] Public ping attempt | url=${url}`);
      const res = await axios.get(url, { timeout: REQUEST_TIMEOUT_MS });
      logger.info(
        `[KEEPALIVE] Public ping successful | status=${res.status} | duration=${Date.now() - startedAt}ms`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        `[KEEPALIVE] Public ping failed | error=${message} | duration=${Date.now() - startedAt}ms`,
      );
    }
  };

  let job: ScheduledTask;
  try {
    job = cron.schedule(SCHEDULE, ping, { noOverlap: true, unref: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[KEEPALIVE] Cron scheduling failed | error=${message}`);
    throw err;
  }

  logger.info(`[KEEPALIVE] Cron scheduler started | interval=${SCHEDULE} | url=${url}`);

  activeHandle = {
    stop: (): void => {
      job.stop();
      activeHandle = null;
      logger.info('[KEEPALIVE] Cron scheduler stopped');
    },
  };

  return activeHandle;
};