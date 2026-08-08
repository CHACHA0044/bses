import type { Application } from 'express';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { config } from '../config';

/**
 * Proxy routing table forwarding API requests from Gateway to microservices.
 * Passes correlation ID (`x-correlation-id`) and request ID (`x-request-id`)
 * to all downstream services.
 */
export const registerRoutes = (app: Application): void => {
  const proxyOptions = {
    changeOrigin: true,
    timeout: 10_000,
    on: {
      proxyReq: (proxyReq: any, req: any) => {
        if (req.correlationId) {
          proxyReq.setHeader('x-correlation-id', req.correlationId);
        }
        fixRequestBody(proxyReq, req);
      },
      error: (_err: Error, _req: unknown, res: any) => {
        if (!res.headersSent) {
          res.status(503).json({
            success: false,
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: 'Upstream service is temporarily unavailable',
            },
          });
        }
      },
    },
  };

  app.use('/api/auth', createProxyMiddleware({ target: config.AUTH_SERVICE_URL, pathRewrite: (path) => '/api/auth' + path, ...proxyOptions }));
  app.use('/api/users', createProxyMiddleware({ target: config.CONSUMER_SERVICE_URL, pathRewrite: (path) => '/api/users' + path, ...proxyOptions }));
  app.use('/api/connections', createProxyMiddleware({ target: config.CONSUMER_SERVICE_URL, pathRewrite: (path) => '/api/connections' + path, ...proxyOptions }));
  app.use('/api/documents', createProxyMiddleware({ target: config.DOCUMENT_SERVICE_URL, pathRewrite: (path) => '/api/documents' + path, ...proxyOptions }));
  app.use('/api/notifications', createProxyMiddleware({ target: config.NOTIFICATION_SERVICE_URL, pathRewrite: (path) => '/api/notifications' + path, ...proxyOptions }));
  app.use('/api/admin', createProxyMiddleware({ target: config.CONSUMER_SERVICE_URL, pathRewrite: (path) => '/api/admin' + path, ...proxyOptions }));
};
