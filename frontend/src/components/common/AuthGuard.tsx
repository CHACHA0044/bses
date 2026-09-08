'use client';

import React, { useEffect, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from './LoadingSpinner';
import { Logo } from './Logo';

export type AllowedRole = 'CONSUMER' | 'ADMIN' | 'SUPER_ADMIN';

interface AuthGuardProps {
  children: React.ReactNode;
  requireRole?: AllowedRole;
  /** Multiple allowed roles (alternative to requireRole). */
  allowRoles?: AllowedRole[];
  /** Where to send an authenticated user who lacks the required role. */
  fallbackHref?: string;
}

/**
 * AuthGuard — client-side route protection.
 *
 * While the session is still being verified it renders nothing but a centered
 * spinner, so protected content is never briefly rendered for unauthenticated
 * users (no flash, no hydration mismatch). Redirects guests to /login (with a
 * `next` return path) and wrong-role users to an appropriate dashboard.
 *
 * Backend authorization remains authoritative — this is UX + routing only.
 */
export const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  requireRole,
  allowRoles,
  fallbackHref,
}) => {
  const { user, isAuthenticated, isLoading, isLoadingLogout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const allowed = useMemo(
    () => allowRoles ?? (requireRole ? [requireRole] : undefined),
    [allowRoles, requireRole],
  );

  // Fail-safe: never let the guard sit on the loading screen forever. If the
  // session check hasn't settled within 8s (network hang, gateway down, store
  // regression), bounce to /login with a `next` return path.
  useEffect(() => {
    if (!isLoading || isLoadingLogout) return;
    const timer = setTimeout(() => {
      const next = pathname ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${next}`);
    }, 8000);
    return () => clearTimeout(timer);
  }, [isLoading, isLoadingLogout, pathname, router]);

  useEffect(() => {
    // Never hijack an in-progress logout: the logout flow performs its own
    // navigation to the landing page. Redirecting here would both blank the
    // screen and send the user to /login instead of Home.
    if (isLoading || isLoadingLogout) return;

    if (!isAuthenticated) {
      const next = pathname ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${next}`);
      return;
    }

    if (allowed && user && !allowed.includes(user.role as AllowedRole)) {
      const dest =
        user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
          ? '/admin/dashboard'
          : fallbackHref ?? '/dashboard';
      router.replace(dest);
    }
  }, [isLoading, isLoadingLogout, isAuthenticated, user, allowed, pathname, router, fallbackHref]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-50 px-4">
        <Logo size="lg" />
        <LoadingSpinner label="Authenticating session..." />
      </div>
    );
  }

  // While a logout is in flight, keep the current page mounted so the
  // navigation to the landing page is seamless (no blank/white flash). The
  // AuthGuard unmounts naturally when the protected layout is replaced by the
  // public landing page.
  if (!isAuthenticated) {
    return isLoadingLogout ? <>{children}</> : null;
  }

  if (allowed && user && !allowed.includes(user.role as AllowedRole)) return null;

  return <>{children}</>;
};
