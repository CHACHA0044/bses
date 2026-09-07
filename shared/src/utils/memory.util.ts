import type winston from 'winston';

export interface MemorySnapshot {
  /** Process RSS in MB (total resident set — the number that counts against
   *  Render's hard memory cap). */
  rssMb: number;
  /** V8 heap used in MB (subset of RSS; excludes native/allocated buffers). */
  heapUsedMb: number;
  /** V8 heap total in MB. */
  heapTotalMb: number;
  /** Size in MB of memory allocated to external C++ (buffers, sharp, etc.). */
  externalMb: number;
}

/** One-line memory snapshot usable in log context. */
export const getMemorySnapshot = (): MemorySnapshot => {
  const usage = process.memoryUsage();
  return {
    rssMb: Math.round((usage.rss / 1024 / 1024) * 10) / 10,
    heapUsedMb: Math.round((usage.heapUsed / 1024 / 1024) * 10) / 10,
    heapTotalMb: Math.round((usage.heapTotal / 1024 / 1024) * 10) / 10,
    externalMb: Math.round((usage.external / 1024 / 1024) * 10) / 10,
  };
};

/**
 * Periodically logs this process's memory footprint so a memory regression
 * shows up in Render logs BEFORE the container is OOM-killed. Cheap: one
 * `process.memoryUsage()` call per tick (the value is sampled, not polled
 * continuously). Returns a handle so the caller can stop it on shutdown.
 */
export const startMemoryMonitor = (
  logger: winston.Logger,
  label: string,
  intervalMs = 120_000,
): { stop: () => void } => {
  const log = (): void => {
    const m = getMemorySnapshot();
    logger.info(`[MEMORY:${label}]`, {
      rssMb: m.rssMb,
      heapUsedMb: m.heapUsedMb,
      heapTotalMb: m.heapTotalMb,
      externalMb: m.externalMb,
    });
  };
  // First sample shortly after start (captures baseline before steady state).
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