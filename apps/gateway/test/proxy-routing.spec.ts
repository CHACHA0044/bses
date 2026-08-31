import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import http from 'http';

/**
 * End-to-end proxy routing regression test.
 *
 * Verifies the gateway forwards requests to upstream services with the FULL
 * `/api/<prefix>/...` path intact. http-proxy-middleware v3 receives `req.url`
 * with the Express mount prefix stripped (e.g. `/login`), so `pathRewrite` must
 * re-add it — otherwise auth-service 404s with "Route POST /login not found".
 */
interface SeenEntry {
  url: string;
  body?: unknown;
}

const seen: Record<string, SeenEntry[]> = {};
let gatewayUrl = '';

async function startStub(name: string): Promise<number> {
  seen[name] = [];
  const app = express();
  app.use(express.json());
  app.use((req, res) => {
    seen[name].push({ url: req.originalUrl, body: req.body });
    res.json({ success: true, service: name, receivedUrl: req.originalUrl });
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as { port: number }).port;
}

beforeAll(async () => {
  const auth = await startStub('auth');
  const consumer = await startStub('consumer');
  const document = await startStub('document');
  const notification = await startStub('notification');

  // Must be set BEFORE importing the gateway app, which snapshots config at import time.
  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${auth}`;
  process.env.CONSUMER_SERVICE_URL = `http://127.0.0.1:${consumer}`;
  process.env.DOCUMENT_SERVICE_URL = `http://127.0.0.1:${document}`;
  process.env.NOTIFICATION_SERVICE_URL = `http://127.0.0.1:${notification}`;

  const { createApp } = await import('../src/app');
  const server = http.createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  gatewayUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

describe('Gateway proxy routing (pathRewrite re-adds mount prefix)', () => {
  it.each([
    ['POST /api/auth/login', '/api/auth/login', 'auth'],
    ['POST /api/auth/register', '/api/auth/register', 'auth'],
    ['POST /api/auth/refresh', '/api/auth/refresh', 'auth'],
    ['POST /api/auth/forgot-password', '/api/auth/forgot-password', 'auth'],
    ['GET /api/users/profile', '/api/users/profile', 'consumer'],
    ['GET /api/connections?status=pending', '/api/connections?status=pending', 'consumer'],
    ['GET /api/admin/users?search=raj', '/api/admin/users?search=raj', 'consumer'],
    ['GET /api/documents/abc/download', '/api/documents/abc/download', 'document'],
    ['GET /api/notifications/list', '/api/notifications/list', 'notification'],
  ])('%s reaches upstream with full path', async (_label, path, stub) => {
    const isPost = path.startsWith('/api/auth');
    const res = await fetch(`${gatewayUrl}${path}`, {
      method: isPost ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json' },
      body: isPost ? JSON.stringify({ identifier: 'rajesh_sharma2026', password: 'ConsumerPass@2026!' }) : undefined,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
    const last = seen[stub][seen[stub].length - 1];
    expect(last.url).toBe(path);
  });

  it('POST /api/auth/login forwards the request body', async () => {
    await fetch(`${gatewayUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'rajesh_sharma2026', password: 'ConsumerPass@2026!' }),
    });
    const last = seen['auth'][seen['auth'].length - 1];
    expect(last.body).toEqual({ identifier: 'rajesh_sharma2026', password: 'ConsumerPass@2026!' });
  });

  it('unmatched /api route returns 404 from the gateway', async () => {
    const res = await fetch(`${gatewayUrl}/api/bogus/thing`);
    expect(res.status).toBe(404);
  });
});
