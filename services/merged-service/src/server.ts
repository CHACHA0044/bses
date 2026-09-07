import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import { createLogger, startMemoryMonitor } from '@bses/shared';
import { createApp as createAuthApp } from '../../auth-service/dist/app';
import { createApp as createConsumerApp } from '../../consumer-service/dist/app';
import { createApp as createNotificationApp } from '../../notification-service/dist/app';
import {
  connectDatabase as connectAuthDatabase,
  disconnectDatabase as disconnectAuthDatabase,
} from '../../auth-service/dist/db/db.client';
import {
  setPrismaClient as setConsumerPrismaClient,
} from '../../consumer-service/dist/db/db.client';
import {
  setPrismaClient as setNotificationPrismaClient,
} from '../../notification-service/dist/db/db.client';

const logger = createLogger({ service: 'merged-service' });

const envPort = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Merged process: runs the auth, consumer, and notification Express apps inside
 * ONE Node process so the Render Free tier (512 MB) does not pay the V8 baseline
 * cost of three separate processes. Each app still binds its OWN loopback port
 * (3010 / 3011 / 3013) on 127.0.0.1 — the gateway proxy and all internal
 * `*_SERVICE_URL` env vars are unchanged. All three share a SINGLE Prisma client
 * and a single PostgreSQL pool, which also cuts database connection count.
 */
const start = async (): Promise<void> => {
  const authPort = envPort(process.env['INTERNAL_PORT_AUTH'], 3010);
  const consumerPort = envPort(process.env['INTERNAL_PORT_CONSUMER'], 3011);
  const notificationPort = envPort(process.env['INTERNAL_PORT_NOTIFICATION'], 3013);

  // Create ONE shared database client, then inject it into every service so the
  // three apps share a single PrismaClient + pg Pool (matches the memory budget).
  const sharedPrisma = await connectAuthDatabase();
  setConsumerPrismaClient(sharedPrisma);
  setNotificationPrismaClient(sharedPrisma);

  const authApp: express.Application = createAuthApp();
  const consumerApp: express.Application = createConsumerApp();
  const notificationApp: express.Application = createNotificationApp();

  const servers: http.Server[] = [];
  // IMPORTANT: never call `app.listen()` AND then `server.listen()` on the same
  // server — that throws ERR_SERVER_ALREADY_LISTEN. Each app binds exactly once
  // on its own loopback port inside `listen`.
  const listen = (app: express.Application, port: number, label: string): Promise<void> =>
    new Promise((resolve) => {
      const server = app.listen(port, '127.0.0.1', () => {
        servers.push(server);
        logger.info(`${label} listening on 127.0.0.1:${port}`);
        resolve();
      });
    });

  await Promise.all([
    listen(authApp, authPort, 'auth'),
    listen(consumerApp, consumerPort, 'consumer'),
    listen(notificationApp, notificationPort, 'notification'),
  ]);

  logger.info('Merged service running', {
    env: process.env['NODE_ENV'] ?? 'development',
    ports: { auth: authPort, consumer: consumerPort, notification: notificationPort },
  });

  // Three Express apps in one process — a memory regression shows up here
  // (before an OOM restart) thanks to a periodic RSS/heap sample.
  const memoryMonitor = startMemoryMonitor(logger, 'merged', 120_000);

  const closeAll = async (): Promise<void> => {
    logger.info('Merged service shutting down');
    memoryMonitor.stop();
    const closes = servers.map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    );
    await Promise.allSettled(closes);
    await disconnectAuthDatabase();
  };

  process.on('SIGTERM', () => {
    void closeAll().finally(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    void closeAll().finally(() => process.exit(0));
  });
};

start().catch((err: unknown) => {
  console.error('Fatal: Merged service failed to start', err);
  process.exit(1);
});