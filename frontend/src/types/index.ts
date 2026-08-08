export interface UserProfile {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  username: string;
  caNumber?: string | null;
  meterNumber?: string | null;
  role: 'CONSUMER' | 'ADMIN' | 'SUPER_ADMIN';
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}

export interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: UserProfile | null) => void;
  logout: () => void;
}
