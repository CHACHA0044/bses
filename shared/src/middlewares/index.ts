import type { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import { randomUUID } from 'crypto';
import { AppError, ValidationError, isAppError } from '../errors';
import { sendError } from '../responses';
import { HTTP_STATUS } from '../constants';
import { createLogger } from '../logger';
import { requestIdMiddleware } from './requestId';

const logger = createLogger({ service: 'shared-middleware' });

export { requestIdMiddleware };

/**
 * Attaches a UUID correlation ID to every incoming request.
 */
export const correlationId = (req: Request, res: Response, next: NextFunction): void => {
  const id = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
  res.setHeader('x-correlation-id', id);
  req.correlationId = id;
  next();
};

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('HTTP Request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
      correlationId: req.correlationId,
      ip: req.ip,
    });
  });
  next();
};

export const compressionMiddleware = compression();

export const notFound = (req: Request, res: Response): void => {
  sendError(
    res,
    'NOT_FOUND',
    `Route ${req.method} ${req.originalUrl} not found`,
    HTTP_STATUS.NOT_FOUND,
  );
};

export const globalErrorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (isAppError(err)) {
    if (err instanceof ValidationError) {
      sendError(res, err.code, err.message, err.statusCode, err.errors);
      return;
    }
    sendError(res, err.code, err.message, err.statusCode);
    return;
  }

  logger.error('Unhandled error', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    path: req.path,
    method: req.method,
    correlationId: req.correlationId,
  });

  sendError(
    res,
    'INTERNAL_SERVER_ERROR',
    'An unexpected error occurred. Please try again later.',
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
  );
};
