import { create } from 'zustand';
import { apiClient } from '../lib/apiClient';

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
  checkSession: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false, error: null }),

  checkSession: async () => {
    set({ isLoading: true });
    try {
      const res = await apiClient.get('/auth/session');
      if (res.data.success && res.data.data.authenticated) {
        set({ user: res.data.data.user, isAuthenticated: true, isLoading: false });
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch (err) {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  logout: async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Ignore logout API error — clear store regardless
    } finally {
      set({ user: null, isAuthenticated: false, isLoading: false });
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  },
}));
