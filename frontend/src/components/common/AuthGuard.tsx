'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from './LoadingSpinner';

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
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const allowed = allowRoles ?? (requireRole ? [requireRole] : undefined);

  useEffect(() => {
    if (isLoading) return;

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
  }, [isLoading, isAuthenticated, user, allowed, pathname, router, fallbackHref]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoadingSpinner label="Authenticating session..." />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (allowed && user && !allowed.includes(user.role as AllowedRole)) return null;

  return <>{children}</>;
};
