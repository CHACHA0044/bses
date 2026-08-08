import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route protection (server-side, edge).
 *
 * This middleware only makes *UX-level* redirect decisions based on the
 * presence of auth cookies and (best-effort, unverified) JWT role decoding.
 * Real authorization is enforced by the backend services — this layer exists
 * to prevent flashes of protected content and to short-circuit guests.
 *
 * Deliberately conservative:
 *  - A user with cookies present is always let through (even if the access
 *    token is expired) so the client can attempt a silent refresh instead of
 *    being locked out. The client-side AuthGuard handles the final decision.
 *  - Logged-in users are NOT redirected away from /login here, which avoids
 *    redirect loops when tokens are stale.
 */

const ACCESS_COOKIE = 'bses_access_token';
const REFRESH_COOKIE = 'bses_refresh_token';

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];
const PROTECTED_PREFIXES = ['/dashboard', '/profile', '/settings', '/connections', '/admin'];

/** Best-effort JWT payload decode (base64url, no signature verification). */
function decodeJwtRole(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return (JSON.parse(json) as { role?: string })?.role ?? null;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api') || pathname.startsWith('/_next')) {
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  // Guest — no cookies at all → straight to login, remembering where they came from.
  if (!access && !refresh) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // Consumer trying to reach an admin-only area → send them to their dashboard.
  const isAdminOnly = pathname === '/admin' || pathname.startsWith('/admin/');
  const role = access ? decodeJwtRole(access) : null;
  if (isAdminOnly && role && !ADMIN_ROLES.includes(role)) {
    const dashboardUrl = new URL('/dashboard', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
