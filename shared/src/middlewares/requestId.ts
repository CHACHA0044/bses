import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Middleware that extracts or generates a unique Request ID (`x-request-id`)
 * and Correlation ID (`x-correlation-id`) for request tracing across services.
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const existingCorrelationId =
    (req.headers['x-correlation-id'] as string | undefined) ||
    (req.headers['x-request-id'] as string | undefined);

  const correlationId = existingCorrelationId || randomUUID();
  const requestId = randomUUID();

  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  res.setHeader('x-request-id', requestId);

  next();
};
