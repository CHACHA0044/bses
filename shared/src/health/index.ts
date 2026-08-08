import type { Request, Response } from 'express';
import { sendSuccess } from '../responses';

export interface HealthCheckOptions {
  serviceName: string;
  version?: string;
  getReadinessStatus?: () => Promise<{ ready: boolean; details?: Record<string, unknown> }> | { ready: boolean; details?: Record<string, unknown> };
}

export const createHealthHandlers = (options: HealthCheckOptions) => {
  const { serviceName, version = '1.0.0', getReadinessStatus } = options;

  const healthHandler = (_req: Request, res: Response): void => {
    sendSuccess(res, {
      status: 'UP',
      service: serviceName,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  };

  const readinessHandler = async (_req: Request, res: Response): Promise<void> => {
    try {
      if (getReadinessStatus) {
        const readiness = await getReadinessStatus();
        if (!readiness.ready) {
          res.status(503).json({
            success: false,
            error: {
              code: 'SERVICE_NOT_READY',
              message: `${serviceName} is not ready to handle requests`,
              details: readiness.details,
            },
          });
          return;
        }
        sendSuccess(res, {
          status: 'READY',
          service: serviceName,
          details: readiness.details,
        });
        return;
      }

      sendSuccess(res, {
        status: 'READY',
        service: serviceName,
      });
    } catch (err: unknown) {
      res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_NOT_READY',
          message: err instanceof Error ? err.message : 'Readiness check failed',
        },
      });
    }
  };

  const versionHandler = (_req: Request, res: Response): void => {
    sendSuccess(res, {
      service: serviceName,
      version,
      nodeVersion: process.version,
      environment: process.env['NODE_ENV'] || 'development',
    });
  };

  return {
    healthHandler,
    readinessHandler,
    versionHandler,
  };
};
