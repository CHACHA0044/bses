import type { Application } from 'express';
import http from 'http';
import https from 'https';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { createLogger, isAllowedOrigin } from '@bses/shared';
import { config } from '../config';

const logger = createLogger({ service: 'gateway-proxy' });

/**
 * Proxy routing table forwarding API requests from Gateway to microservices.
 * Passes correlation ID (`x-correlation-id`) and request ID (`x-request-id`)
 * to all downstream services.
 *
 * Upstream services route on the FULL `/api/<prefix>/...` path (e.g. auth-service
 * mounts `/api/auth`), so pathRewrite must restore it: http-proxy-middleware v3
 * receives `req.url` with the Express mount prefix already stripped (e.g. `/login`),
 * which would 404 upstream. `req.originalUrl` preserves the exact original path AND
 * query string, so forwarding it keeps upstream URLs identical to what the client
 * requested.
 */
interface ProxyMount {
  prefix: string;
  target: string;
}
const proxyMounts: ProxyMount[] = [
  { prefix: '/api/auth', target: config.AUTH_SERVICE_URL },
  { prefix: '/api/users', target: config.CONSUMER_SERVICE_URL },
  { prefix: '/api/connections', target: config.CONSUMER_SERVICE_URL },
  { prefix: '/api/documents', target: config.DOCUMENT_SERVICE_URL },
  { prefix: '/api/notifications', target: config.NOTIFICATION_SERVICE_URL },
  { prefix: '/api/admin', target: config.CONSUMER_SERVICE_URL },
];

/**
 * Multipart/form-data bodies must stream through the gateway UNTOUCHED.
 * `fixRequestBody` re-serializes a parsed body when a body-parser has consumed
 * the stream; its multipart branch flattens the file part into a plain string
 * field, which corrupts the upload on the upstream side ("Unexpected end of
 * form" in multer/busboy). For multipart requests we never call it, so
 * http-proxy pipes the raw request stream (and its Content-Length) verbatim.
 */
const isMultipartRequest = (contentType: string | undefined): boolean =>
  typeof contentType === 'string' && contentType.toLowerCase().includes('multipart/form-data');

/**
 * Keep-alive agents reuse sockets to each upstream. Without them, every proxied
 * request opens a fresh TCP connection (plus TLS handshake), which churns under
 * load and can manifest as intermittent connection-reset / 503s on otherwise
 * healthy services.
 */
const createAgent = (target: string): http.Agent =>
  target.startsWith('https://')
    ? new https.Agent({ keepAlive: true, maxSockets: 100, keepAliveMsecs: 1000 })
    : new http.Agent({ keepAlive: true, maxSockets: 100, keepAliveMsecs: 1000 });

export const registerRoutes = (app: Application): void => {
  for (const { prefix, target } of proxyMounts) {
    app.use(
      prefix,
      createProxyMiddleware({
        target,
        changeOrigin: true,
        agent: createAgent(target),
        // 30s timeout — generous enough for document uploads and OCR-heavy
        // requests, but prevents a hung upstream from holding connections
        // indefinitely. The client enforces its own timeout as a backstop.
        timeout: 30_000,
        proxyTimeout: 30_000,
        pathRewrite: (_path: string, req: any) => req.originalUrl,
        on: {
          proxyReq: (proxyReq: any, req: any) => {
            if (req.correlationId) {
              proxyReq.setHeader('x-correlation-id', req.correlationId);
            }
            const contentType = req.headers['content-type'];
            if (!isMultipartRequest(contentType)) {
              fixRequestBody(proxyReq, req);
            }
          },
          proxyRes: (proxyRes: any, req: any) => {
            // IMPORTANT: CORS headers for proxied responses must be applied to
            // `proxyRes.headers` (the upstream response headers), NOT the Express
            // `res` object. http-proxy follows this hook with
            // `res.writeHead(proxyRes.statusCode, proxyRes.headers)`, and in Node
            // writeHead REPLACES any headers previously set via `res.setHeader()`.
            // Setting them on `proxyRes.headers` makes them survive writeHead on
            // EVERY proxied response — including streamed binary bodies (document
            // previews/PDFs/images) that bypass middleware — which is what fixes the
            // browser blocking cross-origin blob responses ("Network Error" in axios).
            const origin = req.headers.origin;
            if (origin && isAllowedOrigin(origin, config.CORS_ORIGINS)) {
              proxyRes.headers['access-control-allow-origin'] = origin;
              proxyRes.headers['access-control-allow-credentials'] = 'true';
              const exposed = [
                'Content-Disposition',
                'Content-Type',
                'Content-Length',
                'x-correlation-id',
                'x-request-id',
              ].join(', ');
              proxyRes.headers['access-control-expose-headers'] =
                (proxyRes.headers['access-control-expose-headers']
                  ? proxyRes.headers['access-control-expose-headers'] + ', '
                  : '') + exposed;
            }
          },
          error: (err: Error, req: any, res: any) => {
            // Surface the actual upstream failure (timeout, ECONNREFUSED,
            // ECONNRESET, ...) with the correlation ID so the root cause is
            // traceable to a specific service instead of a blind 503.
            logger.error('Upstream proxy error', {
              code: (err as NodeJS.ErrnoException).code,
              message: err.message,
              correlationId: req?.correlationId,
              method: req?.method,
              url: req?.originalUrl,
            });
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
      }),
    );
  }
};
