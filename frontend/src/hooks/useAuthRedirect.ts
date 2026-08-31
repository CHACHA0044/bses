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
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const dest = getSafeReturnPath() ?? fallbackHref ?? roleDashboard(user?.role);
    router.replace(dest);
  }, [isLoading, isAuthenticated, user, router, fallbackHref]);

  return { isLoading, isAuthenticated, pending: isLoading || isAuthenticated };
};
