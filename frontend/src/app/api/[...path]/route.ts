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

interface ParsedCookie {
  name: string;
  value: string;
  path?: string;
  maxAge?: number;
  expires?: Date;
  sameSite?: 'lax' | 'strict' | 'none';
  secure?: boolean;
  httpOnly?: boolean;
}

function parseCookieHeader(cookieStr: string): ParsedCookie | null {
  const parts = cookieStr.split(';').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const [first, ...attributes] = parts;
  const eqIdx = first.indexOf('=');
  if (eqIdx === -1) return null;

  const name = first.substring(0, eqIdx).trim();
  const value = first.substring(eqIdx + 1).trim();
  if (!name) return null;

  const result: ParsedCookie = { name, value };

  for (const attr of attributes) {
    const attrEqIdx = attr.indexOf('=');
    const key = (attrEqIdx === -1 ? attr : attr.substring(0, attrEqIdx)).trim().toLowerCase();
    const val = attrEqIdx === -1 ? '' : attr.substring(attrEqIdx + 1).trim();

    if (key === 'path') {
      result.path = val || '/';
    } else if (key === 'max-age') {
      const num = Number(val);
      if (Number.isFinite(num)) result.maxAge = num;
    } else if (key === 'expires') {
      const d = new Date(val);
      if (!isNaN(d.getTime())) result.expires = d;
    } else if (key === 'httponly') {
      result.httpOnly = true;
    } else if (key === 'secure') {
      result.secure = true;
    } else if (key === 'samesite') {
      const lowerVal = val.toLowerCase();
      if (lowerVal === 'lax' || lowerVal === 'strict' || lowerVal === 'none') {
        result.sameSite = lowerVal;
      }
    }
  }

  return result;
}

async function proxy(
  req: NextRequest,
  ctx: { params: { path: string[] } },
  method: string,
): Promise<NextResponse> {
  const origin = req.headers.get('origin');
  const upstreamBase = getUpstreamBase();
  const upstreamUrl = joinPath(upstreamBase, ctx.params.path ?? []);

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
      if (!upstreamHeaders.has('content-type')) {
        upstreamHeaders.set('content-type', ct);
      }
      if (ct.toLowerCase().includes('multipart/form-data')) {
        body = await req.arrayBuffer();
      } else {
        const text = await req.text();
        if (text) body = text;
      }
    }
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method,
      headers: upstreamHeaders,
      body,
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

  const responseHeaders = new Headers(buildCorsHeaders(origin));

  // Forward a couple of useful response headers.
  const contentType = upstreamRes.headers.get('content-type');
  if (contentType) responseHeaders.set('Content-Type', contentType);
  const correlationId = upstreamRes.headers.get('x-correlation-id');
  if (correlationId) responseHeaders.set('x-correlation-id', correlationId);
  const contentLength = upstreamRes.headers.get('content-length');
  if (contentLength) responseHeaders.set('Content-Length', contentLength);
  const contentDisposition = upstreamRes.headers.get('content-disposition');
  if (contentDisposition) responseHeaders.set('Content-Disposition', contentDisposition);

  // Buffer non-streaming text/JSON responses so Next.js response.cookies.set
  // modifies headers on a standard NextResponse instead of a Web ReadableStream.
  const ctLower = (contentType ?? '').toLowerCase();
  const isStreaming =
    ctLower.includes('octet-stream') ||
    ctLower.includes('image/') ||
    ctLower.includes('video/') ||
    ctLower.includes('pdf') ||
    ctLower.includes('multipart/');

  const resBody = isStreaming ? upstreamRes.body : await upstreamRes.text();

  const response = new NextResponse(resBody, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers: responseHeaders,
  });

  // Extract raw Set-Cookie headers from upstream response
  const rawSetCookies =
    typeof (upstreamRes.headers as any).getSetCookie === 'function'
      ? (upstreamRes.headers as any).getSetCookie()
      : (() => {
          const setCookie = upstreamRes.headers.get('set-cookie');
          return setCookie ? setCookie.split(/,(?=[^;]+=[^;]+)/) : [];
        })();

  // Use Next.js response.cookies.set API to set cookies cleanly on the response
  for (const cookieStr of rawSetCookies) {
    const parsed = parseCookieHeader(cookieStr);
    if (parsed) {
      response.cookies.set({
        name: parsed.name,
        value: parsed.value,
        path: parsed.path ?? '/',
        maxAge: parsed.maxAge,
        expires: parsed.expires,
        sameSite: parsed.sameSite ?? 'lax',
        secure: parsed.secure ?? true,
        httpOnly: parsed.httpOnly ?? true,
      });
    }
  }

  return response;
}
