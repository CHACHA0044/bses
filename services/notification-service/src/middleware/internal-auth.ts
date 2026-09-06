import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthenticationError } from '@bses/shared';
import { config } from '../config';

/**
 * Internal-only endpoint guard.
 *
 * The notification dispatch endpoints are internal service-to-service API and
 * MUST NOT be reachable by end users — otherwise anyone could spam SMS/WhatsApp
 * through the funnel. Every microservice is provisioned with the same
 * `INTERNAL_SERVICE_SECRET`; callers pass it in the `x-internal-secret` header.
 *
 * Comparison is done over SHA-256 digests of fixed length so `timingSafeEqual`
 * never throws on unequal input lengths and runs in constant time.
 */
export const requireInternalSecret = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const provided = String(req.get('x-internal-secret') ?? '');
  const expected = config.INTERNAL_SERVICE_SECRET;

  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    next(new AuthenticationError('Missing or invalid internal service secret'));
    return;
  }
  next();
};