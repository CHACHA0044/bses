import { cookies } from 'next/headers';
import type { ServerSession, ServerUser } from './sessionTypes';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000/api';

const ACCESS_COOKIE = 'bses_access_token';
const REFRESH_COOKIE = 'bses_refresh_token';

/** Best-effort JWT payload decode (server-side, zero network). */
function decodeJwtPayload(token: string): any | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf-8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * getServerSession — resolve the session on the server (RSC) so protected
 * pages render with the user already known.
 *
 * Fast path:
 *  - No cookies → `unauthenticated`, zero network.
 *  - Access token present & valid (`exp` in future) → decode locally, zero network.
 *  - Token expired / missing but refresh token exists → hit backend `/auth/session` silently.
 */
export async function getServerSession(): Promise<ServerSession> {
  const cookieStore = cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;

  if (!accessToken && !refreshToken) {
    return { status: 'unauthenticated' };
  }

  // Fast path: decode non-expired access token locally without network overhead
  if (accessToken) {
    const payload = decodeJwtPayload(accessToken);
    // Access tokens carry `sub` (user id), `username`, `role`, `exp`.
    if (payload && (payload.sub || payload.id) && typeof payload.exp === 'number') {
      const nowSec = Math.floor(Date.now() / 1000);
      if (payload.exp > nowSec + 10) { // 10s buffer
        return {
          status: 'authenticated',
          user: {
            id: payload.sub || payload.id,
            firstName: payload.firstName || '',
            middleName: payload.middleName || null,
            lastName: payload.lastName || '',
            gender: payload.gender || 'OTHER',
            email: payload.email || '',
            username: payload.username || '',
            mobile: payload.mobile || '',
            caNumber: payload.caNumber || '',
            meterNumber: payload.meterNumber || '',
            role: payload.role || 'CONSUMER',
            status: payload.status || 'ACTIVE',
          } as ServerUser,
        };
      }
    }
  }

  // Fallback: network check only when access token is missing or expired
  try {
    const res = await fetch(`${API_BASE}/auth/session`, {
      headers: { Cookie: cookieStore.toString() },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    const json = await res.json();
    if (json?.success && json?.data?.authenticated && json?.data?.user) {
      return { status: 'authenticated', user: json.data.user as ServerUser };
    }
    return { status: 'unauthenticated' };
  } catch {
    return { status: 'unknown' };
  }
}

/**
 * fetchApiData — server-side payload prefetch optimization.
 */
export async function fetchApiData<T = unknown>(path: string): Promise<T | undefined> {
  const cookieStore = cookies();
  if (!cookieStore.has(ACCESS_COOKIE) && !cookieStore.has(REFRESH_COOKIE)) {
    return undefined;
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Cookie: cookieStore.toString() },
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    const json = await res.json();
    if (json?.success) return json.data as T;
    return undefined;
  } catch {
    return undefined;
  }
}
