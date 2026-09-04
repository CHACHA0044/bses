import axios from 'axios';

/**
 * baseURL strategy
 *
 * The Vercel-deployed frontend and the Render-deployed gateway live on
 * DIFFERENT registrable domains. If the browser talks to the gateway
 * directly (cross-origin), the `Set-Cookie` response headers are scoped
 * to the gateway's domain and the Vercel-side middleware can never see
 * them — the user gets bounced back to /login after every successful
 * login/register.
 *
 * Solution: talk to a SAME-ORIGIN path (`/api/...`) and let the
 * catch-all Next.js route at `app/api/[...path]/route.ts` proxy the
 * request to the gateway server-side. The proxy:
 *   - forwards the browser's `Cookie` header on every request, and
 *   - forwards the upstream's `Set-Cookie` headers back to the browser
 *     on the Vercel origin so the middleware sees them.
 *
 * The cross-site render of `NEXT_PUBLIC_API_URL` is still available for
 * server-side code that needs the absolute URL.
 */
export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true, // Send HTTP-Only cookies (now same-origin)
  timeout: 90_000, // Render free-tier cold-start can take 30-60s; 90s covers full cluster wake
});

// Set Content-Type: application/json only when sending body data (POST/PUT/PATCH),
// preventing unexpected CORS preflight checks or header mismatches on GET/blob requests.
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    config.baseURL = '/api';
    if (config.url && config.url.startsWith('http')) {
      try {
        const u = new URL(config.url);
        config.url = u.pathname.replace(/^\/api/, '');
      } catch {
        /* ignore invalid URL */
      }
    }
  }
  if (config.data && !(config.data instanceof FormData) && !config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json';
  }
  return config;
});

/**
 * Single-flight refresh: several page payloads often 401 in parallel after an
 * access token expires. All of them share ONE refresh call instead of each
 * firing its own — fewer round-trips, and no refresh/race churn during
 * navigation.
 */
let refreshPromise: Promise<unknown> | null = null;

/**
 * Helper: axios should auto-parse JSON based on the response Content-Type,
 * but if Vercel's proxy/CDN mangles that header (drops the charset, sends
 * text/plain, sends gzipped bytes, or double-encodes the body) the data
 * comes back as a string. Parse it manually so callers always see a real
 * JS object — and unwrap *any number* of nested JSON encodings, which can
 * happen when a logging/proxy layer does `JSON.stringify(body)` on an
 * already-stringified payload.
 */
function parseBodyIfString(body: unknown, depth = 0): unknown {
  if (typeof body !== 'string' || body.length === 0) return body;
  if (depth > 8) return body; // sanity guard against pathological loops
  const trimmed = body.trim();
  if (trimmed.length === 0) return body;

  // Try to extract a JSON object/array from inside any wrapper (quotes,
  // stray prefixes, BOM, etc.). We do a loose scan for the first '{' or '['
  // and the matching closer so that wrappers like 'prefix{"success":...}'
  // or '{...}\n' still parse correctly.
  const firstBrace = trimmed.search(/[{[]/);
  if (firstBrace < 0) return body;
  const startChar = trimmed[firstBrace];
  const endChar = startChar === '{' ? '}' : ']';
  const lastClose = trimmed.lastIndexOf(endChar);
  if (lastClose <= firstBrace) return body;
  const candidate = trimmed.slice(firstBrace, lastClose + 1);
  try {
    const parsed = JSON.parse(candidate);
    // If we just unwrapped a JSON-encoded string, recurse — defensive against
    // multi-layer JSON.stringify wrappers (proxy, logger, response interceptors).
    if (typeof parsed === 'string' && parsed.trim().length > 0) {
      const inner = parseBodyIfString(parsed, depth + 1);
      if (inner !== parsed) return inner;
    }
    return parsed;
  } catch {
    return body;
  }
}

// Build marker — bump this whenever the parser logic changes so we can see
// in the browser console whether the latest deploy is actually live.
const BUILD_MARKER = 'BSES_API_CLIENT_BUILD_2026-09-03_v3';
if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.info('[BSES_API_CLIENT] build marker:', BUILD_MARKER);
}

apiClient.interceptors.response.use(
  (response) => {
    response.data = parseBodyIfString(response.data);
    return response;
  },
  async (error) => {
    if (error?.response?.data) {
      error.response.data = parseBodyIfString(error.response.data);
    }
    const originalRequest = error.config;

    // Handle token refresh automatically if 401 occurs and request hasn't been retried
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      originalRequest._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = apiClient.post('/auth/refresh').finally(() => {
            refreshPromise = null;
          });
        }
        await refreshPromise;
        return apiClient(originalRequest);
      } catch (refreshErr) {
        // Session expired — redirect to session expired page if in browser
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/session-expired';
        }
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  },
);
