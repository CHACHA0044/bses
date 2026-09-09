import type winston from 'winston';

export interface MemorySnapshot {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
}

export const getMemorySnapshot = (): MemorySnapshot => {
  const usage = process.memoryUsage();
  return {
    rssMb: Math.round((usage.rss / 1024 / 1024) * 10) / 10,
    heapUsedMb: Math.round((usage.heapUsed / 1024 / 1024) * 10) / 10,
    heapTotalMb: Math.round((usage.heapTotal / 1024 / 1024) * 10) / 10,
    externalMb: Math.round((usage.external / 1024 / 1024) * 10) / 10,
  };
};

/** Render's hard memory cap for this tier. */
const MEMORY_CAP_MB = 512;
const WARN_THRESHOLD = 0.85;  // 435 MB
const CRIT_THRESHOLD = 0.95;  // 486 MB

/**
 * Periodically logs this process's memory footprint so a memory regression
 * shows up in Render logs BEFORE the container is OOM-killed.
 *
 * Format: 🧠 Memory | total=316MB | rss=57MB | heap=7.8MB
 * Only escalates to ⚠️ / 🚨 when approaching the Render cap.
 */
export const startMemoryMonitor = (
  logger: winston.Logger,
  label: string,
  intervalMs = 120_000,
): { stop: () => void } => {
  const log = (): void => {
    const m = getMemorySnapshot();
    const totalMb = Math.round(m.rssMb * 10) / 10;
    const usageRatio = totalMb / MEMORY_CAP_MB;

    if (usageRatio >= CRIT_THRESHOLD) {
      logger.error(`🚨 Memory critical | total=${totalMb}MB / ${MEMORY_CAP_MB}MB | rss=${m.rssMb}MB | heap=${m.heapUsedMb}MB`);
    } else if (usageRatio >= WARN_THRESHOLD) {
      logger.warn(`⚠️ Memory high | total=${totalMb}MB / ${MEMORY_CAP_MB}MB | rss=${m.rssMb}MB | heap=${m.heapUsedMb}MB`);
    } else {
      logger.info(`🧠 Memory | total=${totalMb}MB | rss=${m.rssMb}MB | heap=${m.heapUsedMb}MB | ext=${m.externalMb}MB`);
    }
  };
  const first = setTimeout(log, 30_000);
  first.unref();
  const interval = setInterval(log, intervalMs);
  interval.unref();
  return {
    stop: (): void => {
      clearTimeout(first);
      clearInterval(interval);
    },
  };
};