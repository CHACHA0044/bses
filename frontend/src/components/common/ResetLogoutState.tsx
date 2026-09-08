'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';

/**
 * ResetLogoutState — mounted on the public landing page.
 *
 * During a logout the store keeps `isLoadingLogout: true` for the duration of
 * the navigation to the landing page so the AuthGuard keeps the protected page
 * mounted (no blank/white flash). Once the landing page mounts, this resets the
 * flag so the store returns to a clean guest state — any later logout is no
 * longer treated as in-flight.
 */
export const ResetLogoutState: React.FC = () => {
  useEffect(() => {
    useAuthStore.getState().resetLogoutState();
  }, []);

  return null;
};