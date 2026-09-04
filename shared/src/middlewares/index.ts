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

/**
 * Request paths that should NOT be logged by `requestLogger`. These are
 * high-frequency, low-signal endpoints that would otherwise drown out the log
 * stream when scraped by external monitors (UptimeRobot, Render's own
 * liveness probes, internal self-polling keep-alives, etc.). If you need to
 * debug one of these, hit it directly — the `/health`, `/ready`, `/ping` and
 * `HEAD /` paths are still served normally, they just don't print a log line.
 *
 * For the gateway specifically this matters a LOT: its self-polling keep-alive
 * fires /ping every 3 minutes, and without this filter each ping would emit
 * TWO log lines (the explicit Self-ping hit log + the auto HTTP Request log),
 * which is exactly the "messy" behavior the team flagged.
 */
const REQUEST_LOG_SKIP_PATHS: ReadonlySet<string> = new Set(['/ping', '/health', '/ready']);

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  res.on('finish', () => {
    // Skip noisy low-signal endpoints (see REQUEST_LOG_SKIP_PATHS doc).
    if (REQUEST_LOG_SKIP_PATHS.has(req.path)) return;
    // Also skip HEAD probes (Render's liveness probe hits HEAD /).
    if (req.method === 'HEAD') return;
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
