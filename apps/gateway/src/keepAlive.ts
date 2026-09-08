import http from 'node:http';
import { createLogger } from '@bses/shared';

const logger = createLogger({ service: 'keepalive' });

/** How often (ms) the loop pings the gateway's own /ping endpoint. */
const DEFAULT_INTERVAL_MS = 3 * 60 * 1000;

/** Upper bound for one ping so a stalled client can never hold a socket forever. */
const REQUEST_TIMEOUT_MS = 5_000;

/** Short delay before the first ping so the HTTP server is already listening. */
const FIRST_PING_DELAY_MS = 3_000;

export interface KeepAliveHandle {
  stop(): void;
}

let activeHandle: KeepAliveHandle | null = null;

/**
 * ONE lightweight server-side keep-alive loop for the whole backend, started
 * once when the gateway boots.
 *
 * Honest limitation: this loop runs INSIDE the gateway process, so it can only
 * fire while that process is alive. It CANNOT wake a Render Free instance that
 * Render has already suspended — Render halts the entire container, timers and
 * all, and only external inbound traffic can bring it back. This is fine: the
 * loop keeps an already-running process warm and (via the [KEEPALIVE] logs plus
 * the HTTP request log for GET /ping) gives us proof in Render's log stream that
 * pings are firing. It makes no claim to wake a suspended container.
 *
 * Why loopback (127.0.0.1) instead of the public URL: this process BINDS the
 * public port, so calling itself via loopback is the safest, lightest option —
 * no DNS, no TLS, no egress, no dependence on Render's ingress. The payload is
 * one tiny GET every 3 minutes; nothing is retained between calls.
 *
 * Re-entrancy / reload safety: a module-level singleton means a restart or a
 * second `startKeepAlive` call inside the same process can never stack a second
 * interval. The returned handle's `stop()` clears the timers for SIGTERM/SIGINT
 * cleanup.
 */
export const startKeepAlive = (port: number): KeepAliveHandle => {
  if (activeHandle) return activeHandle;

  // Clamp to at least 1 minute so a bad env value can never create a hot loop.
  const intervalMs = Math.max(
    60_000,
    Number(process.env['KEEPALIVE_INTERVAL_MS']) || DEFAULT_INTERVAL_MS,
  );
  const url = `http://127.0.0.1:${port}/ping`;

  const ping = (): void => {
    logger.info('[KEEPALIVE] Ping attempt');

    // A timeout followed by destroy() can also emit 'error' — log the outcome
    // exactly once so a single failed ping never floods the log stream.
    let settled = false;
    const finish = (level: 'info' | 'warn', message: string): void => {
      if (settled) return;
      settled = true;
      if (level === 'warn') logger.warn(message);
      else logger.info(message);
    };

    const req = http.get(url, { timeout: REQUEST_TIMEOUT_MS }, (res) => {
      // Drain the response and release the socket. We never buffer the body.
      res.resume();
      res.on('end', () => {
        if (res.statusCode === 200) {
          finish('info', '[KEEPALIVE] Ping successful | status=200');
        } else {
          finish('warn', `[KEEPALIVE] Ping failed | status=${res.statusCode ?? 'unknown'}`);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      finish('warn', '[KEEPALIVE] Ping failed | error=timed out');
    });

    req.on('error', (err) => {
      finish('warn', `[KEEPALIVE] Ping failed | error=${err.message}`);
    });
  };

  const timer = setInterval(ping, intervalMs);
  timer.unref();
  const firstPing = setTimeout(ping, FIRST_PING_DELAY_MS);
  firstPing.unref();

  logger.info(`[KEEPALIVE] Loop started | interval=${intervalMs}ms | url=${url}`);

  activeHandle = {
    stop: (): void => {
      clearInterval(timer);
      clearTimeout(firstPing);
      activeHandle = null;
      logger.info('[KEEPALIVE] Loop stopped');
    },
  };

  return activeHandle;
};