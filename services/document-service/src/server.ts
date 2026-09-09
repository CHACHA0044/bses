import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { createLogger, startMemoryMonitor } from '@bses/shared';
import { connectMongoDB, disconnectMongoDB } from './db/mongo.client';
import { connectDatabase, disconnectDatabase } from './db/db.client';
import { ocrService, shutdownOcrEngine } from './services/ocr.service';

const logger = createLogger({ service: 'document-service' });

/** How often (ms) the boot recovery sweep re-scans for interrupted jobs. */
const RECOVERY_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Throttle repeated error logging: the first sweep failure logs at `error`,
 * identical failures inside the window only log at `debug` so a persistent
 * problem can't flood the log stream every 5 minutes.
 */
const createThrottledErrorLogger = (windowMs: number) => {
  let lastMsg = '';
  let lastAt = 0;
  return (msg: string, meta: { error: unknown }): void => {
    const now = Date.now();
    const normalised = meta.error instanceof Error ? meta.error.message : String(meta.error);
    if (now - lastAt > windowMs || normalised !== lastMsg) {
      logger.error(`❌ ${msg} | error=${normalised}`);
      lastMsg = normalised;
      lastAt = now;
    } else {
      logger.debug(`❌ ${msg} (repeated, suppressed)`);
    }
  };
};

const start = async (): Promise<void> => {
  try {
    await connectMongoDB({
      uri: config.MONGODB_URI,
      bucketName: config.GRIDFS_BUCKET,
    });
    logger.info(`🍃 MongoDB connected | GridFS=${config.GRIDFS_BUCKET}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`⚠️ MongoDB connection deferred | reason=${msg}`);
  }

  try {
    await connectDatabase();
    logger.info('🗄️ PostgreSQL connected');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`⚠️ PostgreSQL connection deferred | reason=${msg}`);
  }

  const app = createApp();

  const server = app.listen(config.PORT, '127.0.0.1', () => {
    logger.info(`📄 Document service ready | port=${config.PORT} | env=${config.NODE_ENV}`);
  });

  const memoryMonitor = startMemoryMonitor(logger, 'document', 120_000);

  const logThrottledError = createThrottledErrorLogger(RECOVERY_INTERVAL_MS);
  const recoveryTimer = setInterval(() => {
    ocrService.recoverInterruptedJobs().catch((err) => {
      logThrottledError('OCR recovery sweep failed', { error: err });
    });
  }, RECOVERY_INTERVAL_MS);
  setTimeout(() => {
    void ocrService
      .recoverInterruptedJobs()
      .then((recovered) => {
        if (recovered > 0) logger.info(`🔄 OCR recovery re-queued ${recovered} interrupted document(s)`);
      })
      .catch((err) => logger.error(`❌ OCR initial recovery failed | error=${err instanceof Error ? err.message : String(err)}`));
  }, 2000);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`🛑 ${signal} received — shutting down Document service`);
    clearInterval(recoveryTimer);
    memoryMonitor.stop();
    server.close(async () => {
      await shutdownOcrEngine();
      await disconnectMongoDB();
      await disconnectDatabase();
      logger.info('✅ Document service shut down');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((err: unknown) => {
  logger.error(`❌ Document service failed to start | error=${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});