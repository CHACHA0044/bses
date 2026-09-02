/**
 * Catch-all API proxy for the BSES backend.
 *
 * Background
 * ----------
 * The Next.js frontend (Vercel) and the Express gateway (Render) live on
 * DIFFERENT registrable domains. When the browser talks to the gateway
 * directly, the `Set-Cookie` response headers are scoped to the gateway's
 * domain and the Vercel-side middleware can never see them — the user is
 * bounced back to /login after every successful login/register.
 *
 * The other approach — relying on `rewrites()` in next.config.mjs — does
 * NOT forward `Set-Cookie` or `Cookie` headers through Next.js's built-in
 * proxy, so it silently drops the session.
 *
 * This route is a manual, cookie-aware proxy:
 *   - Reads `Cookie` from the incoming request and forwards it to the
 *     backend so authenticated calls work on subsequent navigations.
 *   - Forwards `Set-Cookie` from the backend response back to the browser
 *     on the Vercel origin so the middleware and AuthGuard see them.
 *   - Streams the request body verbatim so multipart/document uploads
 *     aren't re-serialized.
 *
 * Configuration
 * -------------
 * The upstream base URL is read from `BACKEND_API_URL` on the server.
 * Fallback chain: BACKEND_API_URL → NEXT_PUBLIC_API_URL → http://localhost:3000/api
 * (NEXT_PUBLIC_API_URL alone would point the browser cross-site; this
 * route is the only place the absolute backend URL is needed.)
 */
import { NextRequest, NextResponse } from 'next/server';

// Force the route to run on the Node.js runtime — the default Edge
// runtime can't read certain request properties or stream large bodies.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// All methods are proxied transparently.
export const GET = (req: NextRequest, ctx: { params: { path: string[] } }) =>
  proxy(req, ctx, 'GET');
export const POST = (req: NextRequest, ctx: { params: { path: string[] } }) =>
  proxy(req, ctx, 'POST');
export const PUT = (req: NextRequest, ctx: { params: { path: string[] } }) =>
  proxy(req, ctx, 'PUT');
export const PATCH = (req: NextRequest, ctx: { params: { path: string[] } }) =>
  proxy(req, ctx, 'PATCH');
export const DELETE = (req: NextRequest, ctx: { params: { path: string[] } }) =>
  proxy(req, ctx, 'DELETE');
export const HEAD = (req: NextRequest, ctx: { params: { path: string[] } }) =>
  proxy(req, ctx, 'HEAD');
export const OPTIONS = (req: NextRequest, ctx: { params: { path: string[] } }) =>
  proxy(req, ctx, 'OPTIONS');

function getUpstreamBase(): string {
  // Server-side only — never expose to the browser bundle.
  const raw =
    process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
  return raw.replace(/\/+$/, '');
}

function joinPath(base: string, segments: string[]): string {
  return base + '/' + segments.map((s) => encodeURIComponent(s)).join('/');
}

function buildCorsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {};
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Vary'] = 'Origin';
    headers['Access-Control-Expose-Headers'] = [
      'Content-Disposition',
      'Content-Type',
      'Content-Length',
      'x-correlation-id',
      'x-request-id',
    ].join(', ');
  }
  headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
  headers['Access-Control-Allow-Headers'] =
    'Content-Type, Authorization, x-correlation-id, x-request-id, Cookie';
  headers['Access-Control-Max-Age'] = '86400';
  return headers;
}

async function proxy(
  req: NextRequest,
  ctx: { params: { path: string[] } },
  method: string,
): Promise<NextResponse> {
  const origin = req.headers.get('origin');
  const upstreamBase = getUpstreamBase();
  const upstreamUrl = joinPath(upstreamBase, ctx.params.path ?? []);
  const incomingUrl = new URL(req.url);

  // Short-circuit CORS preflight.
  if (method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: buildCorsHeaders(origin),
    });
  }

  // Build upstream headers — forward Cookie, never trust Host/Origin.
  const upstreamHeaders = new Headers();
  for (const [k, v] of req.headers.entries()) {
    const lower = k.toLowerCase();
    if (
      lower === 'host' ||
      lower === 'origin' ||
      lower === 'content-length' ||
      lower === 'connection'
    ) {
      continue;
    }
    upstreamHeaders.set(k, v);
  }
  // Rewrite Host so the upstream matches its own certificate / rate limit.
  try {
    upstreamHeaders.set('host', new URL(upstreamBase).host);
  } catch {
    /* ignore */
  }

  // Read body for non-GET/HEAD methods.
  let body: BodyInit | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const ct = req.headers.get('content-type') ?? '';
    if (ct) {
      // Use the raw stream so multipart uploads aren't buffered.
      body = req.body as unknown as BodyInit;
      // node 18 fetch accepts a ReadableStream; cast appropriately.
      if (!upstreamHeaders.has('content-type')) {
        upstreamHeaders.set('content-type', ct);
      }
    }
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method,
      headers: upstreamHeaders,
      body,
      // Required to forward cookies on same-site redirect chains.
      redirect: 'manual',
    });
  } catch (err: any) {
    return new NextResponse(
      JSON.stringify({
        success: false,
        error: {
          code: 'UPSTREAM_UNREACHABLE',
          message: 'Backend gateway is temporarily unreachable',
        },
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          ...buildCorsHeaders(origin),
        },
      },
    );
  }

  // Build the response, copying status + body + the headers we need.
  const responseHeaders = new Headers(buildCorsHeaders(origin));

  // Forward Set-Cookie verbatim so the browser stores it on the Vercel
  // origin (where subsequent middleware checks happen).
  const setCookie = upstreamRes.headers.get('set-cookie');
  if (setCookie) {
    // Upstream may send multiple Set-Cookie headers combined into one
    // comma-separated string by the fetch API. Set them individually so
    // the browser treats each as a distinct cookie.
    for (const cookie of setCookie.split(/,(?=[^;]+=[^;]+)/)) {
      responseHeaders.append('Set-Cookie', cookie.trim());
    }
  }

  // Forward a couple of useful response headers.
  const contentType = upstreamRes.headers.get('content-type');
  if (contentType) responseHeaders.set('Content-Type', contentType);
  const correlationId = upstreamRes.headers.get('x-correlation-id');
  if (correlationId) responseHeaders.set('x-correlation-id', correlationId);
  const contentLength = upstreamRes.headers.get('content-length');
  if (contentLength) responseHeaders.set('Content-Length', contentLength);
  const contentDisposition = upstreamRes.headers.get('content-disposition');
  if (contentDisposition) responseHeaders.set('Content-Disposition', contentDisposition);

  return new NextResponse(upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers: responseHeaders,
  });
}
