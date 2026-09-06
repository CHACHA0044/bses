import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { createLogger } from '@bses/shared';
import { connectMongoDB, disconnectMongoDB } from './db/mongo.client';
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

  const app = createApp();

  const server = app.listen(config.PORT, '127.0.0.1', () => {
    logger.info('Document service running', { port: config.PORT, env: config.NODE_ENV });
  });

  // Recover any OCR rows left PENDING, or PROCESSING by a previous process
  // (a crash/restart mid-job). Rows that already completed OCR pre-migration
  // (ocr_confidence set, ocr_status default PENDING) are not re-processed.
  const logThrottledError = createThrottledErrorLogger(RECOVERY_INTERVAL_MS);
  const recoveryTimer = setInterval(() => {
    ocrService.recoverInterruptedJobs().catch((err) => {
      logThrottledError('OCR recovery sweep failed', { error: err });
    });
  }, RECOVERY_INTERVAL_MS);
  void ocrService
    .recoverInterruptedJobs()
    .then((recovered) => {
      if (recovered > 0) logger.info(`OCR recovery re-queued ${recovered} interrupted document(s)`);
    })
    .catch((err) => logger.error('OCR initial recovery failed', { error: err }));

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down Document service gracefully`);
    clearInterval(recoveryTimer);
    server.close(async () => {
      await shutdownOcrEngine();
      await disconnectMongoDB();
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
