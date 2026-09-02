import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './useAuth';

/** Safe `next` return path — internal paths only, never protocol-relative. */
export function getSafeReturnPath(): string | null {
  if (typeof window === 'undefined') return null;
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next) return null;
  if (next.startsWith('//') || next.startsWith('/login') || !next.startsWith('/')) return null;
  return next;
}

/** Role-appropriate dashboard href. */
export function roleDashboard(role?: string): string {
  return role === 'ADMIN' || role === 'SUPER_ADMIN' ? '/admin/dashboard' : '/dashboard';
}

/**
 * useAuthRedirect — protects auth routes (login/register/forgot/reset).
 *
 * Once the session state is resolved, an authenticated user is bounced to their
 * dashboard (or the sanitized `next` return path) immediately. The auth form is
 * never rendered for a signed-in user and no auth page can hold one forever:
 * `pending` is true while the session is unknown OR once authenticated (until
 * the redirect effect runs), so callers show a spinner instead of the form.
 */
export const useAuthRedirect = (fallbackHref?: string) => {
  const { user, isAuthenticated, isLoading, checkSession } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const dest = getSafeReturnPath() ?? fallbackHref ?? roleDashboard(user?.role);
    // [AUTH_REDIRECT] trace so we can see in the browser console which path
    // the auth pages send us to and whether middleware later accepts it.
    // eslint-disable-next-line no-console
    console.log('[AUTH_REDIRECT] step=redirecting isAuthenticated=', isAuthenticated, 'role=', user?.role, 'dest=', dest, 'fallbackHref=', fallbackHref, 't=', new Date().toISOString());
    if (typeof window !== 'undefined') {
      window.location.replace(dest);
    } else {
      router.replace(dest);
    }
  }, [isLoading, isAuthenticated, user, router, fallbackHref]);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[AUTH_REDIRECT] step=state isLoading=', isLoading, 'isAuthenticated=', isAuthenticated, 'role=', user?.role, 't=', new Date().toISOString());
  }, [isLoading, isAuthenticated, user]);

  // Fail-safe: if the session check hangs (network unreachable, gateway 5xx,
  // store regression) the auth route would otherwise sit on the
  // "Checking session…" spinner forever and trap the user on /login or
  // /register. After 8s we force-resolve isLoading so the form becomes
  // interactive. Mirrors the AuthGuard fail-safe in components/common/AuthGuard.tsx.
  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => {
      // Re-trigger the session check one more time, in case the original
      // request never went out (StrictMode double-mount, etc.).
      checkSession(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, [isLoading, checkSession]);

  return { isLoading, isAuthenticated, pending: isLoading || isAuthenticated };
};
