import type { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import { randomUUID } from 'crypto';
import { AppError, ValidationError, isAppError } from '../errors';
import { sendError } from '../responses';
import { HTTP_STATUS } from '../constants';
import { createLogger } from '../logger';
import { requestIdMiddleware } from './requestId';

const logger = createLogger({ service: 'middleware' });

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
 * High-frequency low-signal paths skipped by requestLogger.
 * `/ping` is intentionally NOT here — keepalive pings should appear in logs.
 */
const REQUEST_LOG_SKIP_PATHS: ReadonlySet<string> = new Set(['/health', '/ready']);

/**
 * Emoji tag for a request path — makes the log stream visually scannable.
 * Auth paths get 🔐, document paths get 📄, user paths get 👤, etc.
 */
const pathEmoji = (path: string): string => {
  if (path.startsWith('/api/auth')) return '🔐';
  if (path.startsWith('/api/documents')) return '📄';
  if (path.startsWith('/api/users')) return '👤';
  if (path.startsWith('/api/connections')) return '🔌';
  if (path.startsWith('/api/notifications')) return '📧';
  if (path.startsWith('/api/admin')) return '🛡️';
  if (path === '/ping') return '💓';
  return '🌐';
};

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  res.on('finish', () => {
    if (REQUEST_LOG_SKIP_PATHS.has(req.path)) return;
    if (req.method === 'HEAD') return;

    const duration = Date.now() - start;
    const emoji = pathEmoji(req.path);
    const status = res.statusCode;
    const isError = status >= 400;
    const arrow = isError ? '❌' : '→';

    if (isError) {
      logger.error(`${emoji} ${req.method} ${req.path} ${arrow} ${status} | ${duration}ms`, {
        correlationId: req.correlationId,
      });
    } else {
      logger.info(`${emoji} ${req.method} ${req.path} ${arrow} ${status} | ${duration}ms`);
    }
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

  logger.error(`❌ ${req.method} ${req.path} → 500 | unhandled`, {
    error: err instanceof Error ? err.message : String(err),
    correlationId: req.correlationId,
  });

  sendError(
    res,
    'INTERNAL_SERVER_ERROR',
    'An unexpected error occurred. Please try again later.',
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
  );
};
