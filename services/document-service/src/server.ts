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
      logger.error(msg, meta);
      lastMsg = normalised;
      lastAt = now;
    } else {
      logger.debug(`${msg} (repeated, suppressed)`, meta);
    }
  };
};

const start = async (): Promise<void> => {
  try {
    await connectMongoDB({
      uri: config.MONGODB_URI,
      bucketName: config.GRIDFS_BUCKET,
    }).catch((err) => {
      logger.warn(`MongoDB GridFS initial connection skipped in dev mode: ${err.message}`);
    });
  } catch (err: unknown) {
    logger.warn('Document Service starting with uninitialized MongoDB GridFS connection.');
  }

  try {
    await connectDatabase().catch((err) => {
      logger.warn(`PostgreSQL initial connection skipped in dev mode: ${err.message}`);
    });
  } catch (err: unknown) {
    logger.warn('Document Service starting with uninitialized database connection.');
  }

  const app = createApp();

  const server = app.listen(config.PORT, '127.0.0.1', () => {
    logger.info('Document service running', { port: config.PORT, env: config.NODE_ENV });
  });

  // The OCR + sharp + Tesseract memory profile is the largest in the system;
  // sample it here so sustained growth is visible in Render logs before it
  // reaches the container cap and triggers an OOM restart.
  const memoryMonitor = startMemoryMonitor(logger, 'document', 120_000);

  // Recover any OCR rows left PENDING, or PROCESSING by a previous process
  // (a crash/restart mid-job). Rows that already completed OCR pre-migration
  // (ocr_confidence set, ocr_status default PENDING) are not re-processed.
  const logThrottledError = createThrottledErrorLogger(RECOVERY_INTERVAL_MS);
  const recoveryTimer = setInterval(() => {
    ocrService.recoverInterruptedJobs().catch((err) => {
      logThrottledError('OCR recovery sweep failed', { error: err });
    });
  }, RECOVERY_INTERVAL_MS);
  // Initial recovery is deferred out of the critical startup path — the app is
  // ready to serve uploads/downloads immediately; interrupted OCR jobs are
  // re-queued asynchronously without blocking readiness.
  setTimeout(() => {
    void ocrService
      .recoverInterruptedJobs()
      .then((recovered) => {
        if (recovered > 0) logger.info(`OCR recovery re-queued ${recovered} interrupted document(s)`);
      })
      .catch((err) => logger.error('OCR initial recovery failed', { error: err }));
  }, 2000);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down Document service gracefully`);
    clearInterval(recoveryTimer);
    memoryMonitor.stop();
    server.close(async () => {
      await shutdownOcrEngine();
      await disconnectMongoDB();
      await disconnectDatabase();
      logger.info('Document service server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((err: unknown) => {
  console.error('Fatal: Document service failed to start', err);
  process.exit(1);
});