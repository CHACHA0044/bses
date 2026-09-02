import { create } from 'zustand';
import { apiClient } from '../lib/apiClient';
import { warmPostLogin } from '../lib/prefetch';

export interface UserProfile {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender: string;
  email: string;
  username: string;
  mobile?: string;
  caNumber?: string;
  meterNumber?: string;
  role: 'CONSUMER' | 'ADMIN' | 'SUPER_ADMIN';
  status: string;
}

interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  setUser: (user: UserProfile | null) => void;
  setCachedUser: (user: UserProfile | null) => void;
  checkSession: (silent?: boolean) => Promise<void>;
  logout: (router?: { push: (href: string) => void }) => Promise<void>;
}

/**
 * Restore a previously cached session from sessionStorage.
 *
 * This must NOT be called during the initial render (module init): reading a
 * client-only API synchronously makes the first client render differ from the
 * server HTML, which breaks React hydration on every hard load of a protected
 * page. The store now boots in the `isLoading` state on BOTH server and client
 * so the first render always matches; `SessionProvider` restores this cached
 * session (fast path) in an effect after hydration.
 */
export function getInitialUser(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem('bses_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  setUser: (user) => {
    if (typeof window !== 'undefined') {
      if (user) {
        try { sessionStorage.setItem('bses_user', JSON.stringify(user)); } catch {}
        warmPostLogin(user.role);
      } else {
        try { sessionStorage.removeItem('bses_user'); } catch {}
      }
    }
    set({ user, isAuthenticated: !!user, isLoading: false, error: null });
  },

  setCachedUser: (user) => {
    // Optimistically set user for UI (e.g. Navbar branding), but keep isLoading: true
    // so route guards wait for backend checkSession() verification.
    set({ user, isAuthenticated: !!user, isLoading: true, error: null });
  },

  checkSession: async (silent = false) => {
    // If silent (or user already cached), do NOT flip isLoading to true
    if (!silent && !get().user) {
      set({ isLoading: true });
    }
    try {
      const res = await apiClient.get('/auth/session', { timeout: 4000 });
      if (res.data.success && res.data.data.authenticated) {
        get().setUser(res.data.data.user);
      } else {
        get().setUser(null);
      }
    } catch {
      // Keep existing cached state on transient network error, or clear if unauthenticated
      if (!get().user) {
        get().setUser(null);
      }
    }
  },

  logout: async (router) => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Ignore API failure
    } finally {
      if (typeof window !== 'undefined') {
        try { sessionStorage.clear(); } catch {}
      }
      set({ user: null, isAuthenticated: false, isLoading: false, error: null });
      if (router) {
        router.push('/login');
      } else if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  },
}));
