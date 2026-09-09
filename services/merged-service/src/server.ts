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
  logger.info('🗄️ PostgreSQL connected (shared client)');

  // MongoDB GridFS for document storage (best-effort startup: a dev container
  // without MongoDB must still boot).
  try {
    await connectMongoDB({
      uri: documentConfig.MONGODB_URI,
      bucketName: documentConfig.GRIDFS_BUCKET,
    });
    logger.info(`🍃 MongoDB connected | GridFS=${documentConfig.GRIDFS_BUCKET}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`⚠️ MongoDB connection deferred | reason=${msg}`);
  }

  const authApp: express.Application = createAuthApp();
  const consumerApp: express.Application = createConsumerApp();
  const notificationApp: express.Application = createNotificationApp();
  const documentApp: express.Application = createDocumentApp();

  const servers: http.Server[] = [];
  const listen = (app: express.Application, port: number, label: string): Promise<void> =>
    new Promise((resolve) => {
      const server = app.listen(port, '127.0.0.1', () => {
        servers.push(server);
        logger.info(`✅ ${label} listening on 127.0.0.1:${port}`);
        resolve();
      });
    });

  await Promise.all([
    listen(authApp, authPort, 'auth'),
    listen(consumerApp, consumerPort, 'consumer'),
    listen(notificationApp, notificationPort, 'notification'),
    listen(documentApp, documentPort, 'document'),
  ]);

  logger.info('🧩 Internal services ready | auth=3010 consumer=3011 notification=3013 document=3012');

  const memoryMonitor = startMemoryMonitor(logger, 'merged', 120_000);

  const recoveryTimer = setInterval(() => {
    ocrService.recoverInterruptedJobs().catch((err) => {
      logger.error(`❌ OCR recovery sweep failed | error=${String(err)}`);
    });
  }, DOCUMENT_RECOVERY_INTERVAL_MS);
  setTimeout(() => {
    void ocrService
      .recoverInterruptedJobs()
      .then((recovered) => {
        if (recovered > 0) logger.info(`🔄 OCR recovery re-queued ${recovered} interrupted document(s)`);
      })
      .catch((err) => logger.error(`❌ OCR initial recovery failed | error=${String(err)}`));
  }, 2000);

  const closeAll = async (): Promise<void> => {
    logger.info('🛑 Merged service shutting down');
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
  logger.error(`❌ Merged service failed to start | error=${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});