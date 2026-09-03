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
    // Optimistically store user for UI hydration, but keep isAuthenticated: false and isLoading: true
    // so Navbar shows loading state and route guards wait for backend checkSession() verification.
    set({ user, isAuthenticated: false, isLoading: true, error: null });
  },

  checkSession: async (silent = false) => {
    if (!silent && !get().user) {
      set({ isLoading: true });
    }
    // Hard upper bound: if the axios timeout doesn't fire (network hang,
    // gateway cold-start that doesn't kill the socket, etc.) we still need
    // to resolve isLoading so the AuthGuard/Navbar unblock. 8s mirrors the
    // fail-safes in AuthGuard / useAuthRedirect.
    const failSafe = new Promise<void>((resolve) =>
      setTimeout(() => resolve(), 8000),
    );
    const probe = (async () => {
      try {
        const res = await apiClient.get('/auth/session', { timeout: 5000 });
        if (res.data?.success && res.data?.data?.authenticated && res.data?.data?.user) {
          get().setUser(res.data.data.user);
        } else {
          get().setUser(null);
        }
      } catch (err: any) {
        const status = err?.response?.status;
        // 401 / 403 / no-response → no valid session, clear user.
        // Anything else (5xx, hang, gateway outage) → keep cached user (if any)
        // so the UI doesn't flash logged-out, but always force isLoading=false.
        if (status === 401 || status === 403 || !err?.response) {
          get().setUser(null);
        } else {
          // 5xx / network-with-response → trust cached sessionStorage user, stop loading.
          const cached = get().user ?? getInitialUser();
          set({ user: cached, isAuthenticated: !!cached, isLoading: false });
        }
      }
    })();
    await Promise.race([probe, failSafe]);
    // Guarantee isLoading is resolved even if `probe` is still pending in the
    // background — the background call will eventually settle and update the
    // user, but the UI must never sit on a spinner forever.
    if (get().isLoading) {
      set({ isLoading: false });
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
