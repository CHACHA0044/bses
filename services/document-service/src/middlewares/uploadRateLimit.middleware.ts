import type { Request, Response, NextFunction } from 'express';
import { RateLimitError } from '@bses/shared';
import { config } from '../config';

/**
 * Per-user rate limiter for the document upload endpoint.
 *
 * The gateway applies a coarse per-IP limit, but the upload route accepts
 * large multipart bodies that each spawn an OCR job; an authenticated user
 * could otherwise hammer it with repeated large/truncated files. This limiter
 * keys on the authenticated user (`req.user.sub`, set by `authenticate`) and
 * bounds uploads per sliding window. In-memory is acceptable here because
 * every document-service instance is single-threaded behind the gateway and
 * the window state is small; restarting simply resets the counters.
 */
interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

// Opportunistically drop stale windows so the map can't grow unbounded from
// abandoned sessions. `unref()` keeps it from holding the process open.
const WINDOW_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < config.UPLOAD_RATE_LIMIT_WINDOW_MS);
    if (bucket.timestamps.length === 0) buckets.delete(key);
  }
}, WINDOW_CLEANUP_INTERVAL_MS).unref();

export const uploadRateLimiter = (req: Request, _res: Response, next: NextFunction): void => {
  const now = Date.now();
  const key = req.user?.sub ?? req.ip ?? 'anonymous';

  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < config.UPLOAD_RATE_LIMIT_WINDOW_MS);

  if (bucket.timestamps.length >= config.UPLOAD_RATE_LIMIT_MAX) {
    return next(new RateLimitError('Upload limit reached. Please wait a few minutes and try again.'));
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  next();
};
