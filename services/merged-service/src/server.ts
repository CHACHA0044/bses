import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import { createLogger, startMemoryMonitor } from '@bses/shared';
import { createApp as createAuthApp } from '../../auth-service/dist/app';
import { createApp as createConsumerApp } from '../../consumer-service/dist/app';
import { createApp as createNotificationApp } from '../../notification-service/dist/app';
import { createApp as createDocumentApp } from '../../document-service/dist/app';
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
import {
  setPrismaClient as setDocumentPrismaClient,
} from '../../document-service/dist/db/db.client';
import { config as documentConfig } from '../../document-service/dist/config';
import { connectMongoDB, disconnectMongoDB } from '../../document-service/dist/db/mongo.client';
import { ocrService, shutdownOcrEngine } from '../../document-service/dist/services/ocr.service';

const logger = createLogger({ service: 'merged-service' });

const envPort = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 ? n : fallback;
};

/** How often (ms) the boot recovery sweep re-scans for interrupted OCR jobs. */
const DOCUMENT_RECOVERY_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Merged process: runs the auth, consumer, notification, and document Express
 * apps inside ONE Node process so the Render Free tier (512 MB) does not pay the
 * V8 baseline cost of four separate processes. Each app still binds its OWN
 * loopback port (3010 / 3011 / 3013 / 3012) on 127.0.0.1 — the gateway proxy and
 * all internal `*_SERVICE_URL` env vars are unchanged. All four share a SINGLE
 * Prisma client and a single PostgreSQL pool, which also cuts database
 * connection count.
 */
const start = async (): Promise<void> => {
  const authPort = envPort(process.env['INTERNAL_PORT_AUTH'], 3010);
  const consumerPort = envPort(process.env['INTERNAL_PORT_CONSUMER'], 3011);
  const notificationPort = envPort(process.env['INTERNAL_PORT_NOTIFICATION'], 3013);
  const documentPort = envPort(process.env['INTERNAL_PORT_DOCUMENT'], 3012);

  // Create ONE shared database client, then inject it into every service so all
  // four apps share a single PrismaClient + pg Pool (matches the memory budget).
  const sharedPrisma = await connectAuthDatabase();
  setConsumerPrismaClient(sharedPrisma);
  setNotificationPrismaClient(sharedPrisma);
  setDocumentPrismaClient(sharedPrisma);

  // MongoDB GridFS for document storage (best-effort startup: a dev container
  // without MongoDB must still boot).
  try {
    await connectMongoDB({
      uri: documentConfig.MONGODB_URI,
      bucketName: documentConfig.GRIDFS_BUCKET,
    }).catch((err) => {
      logger.warn(`MongoDB GridFS initial connection skipped in dev mode: ${err.message}`);
    });
  } catch (err: unknown) {
    logger.warn('Merged service starting with uninitialized MongoDB GridFS connection.');
  }

  const authApp: express.Application = createAuthApp();
  const consumerApp: express.Application = createConsumerApp();
  const notificationApp: express.Application = createNotificationApp();
  const documentApp: express.Application = createDocumentApp();

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
    listen(documentApp, documentPort, 'document'),
  ]);

  logger.info('Merged service running', {
    env: process.env['NODE_ENV'] ?? 'development',
    ports: {
      auth: authPort,
      consumer: consumerPort,
      notification: notificationPort,
      document: documentPort,
    },
  });

  // Four Express apps in one process — a memory regression shows up here
  // (before an OOM restart) thanks to a periodic RSS/heap sample.
  const memoryMonitor = startMemoryMonitor(logger, 'merged', 120_000);

  // Recover any OCR rows left PENDING, or PROCESSING by a previous process
  // (a crash/restart mid-job). Bounded sweep on the free tier.
  const recoveryTimer = setInterval(() => {
    ocrService.recoverInterruptedJobs().catch((err) => {
      logger.error('OCR recovery sweep failed', { error: String(err) });
    });
  }, DOCUMENT_RECOVERY_INTERVAL_MS);
  setTimeout(() => {
    void ocrService
      .recoverInterruptedJobs()
      .then((recovered) => {
        if (recovered > 0) logger.info(`OCR recovery re-queued ${recovered} interrupted document(s)`);
      })
      .catch((err) => logger.error('OCR initial recovery failed', { error: String(err) }));
  }, 2000);

  const closeAll = async (): Promise<void> => {
    logger.info('Merged service shutting down');
    memoryMonitor.stop();
    clearInterval(recoveryTimer);
    const closes = servers.map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    );
    await Promise.allSettled(closes);
    await shutdownOcrEngine();
    await disconnectMongoDB();
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