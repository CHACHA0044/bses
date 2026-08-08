import { useAuthStore } from '@/store/authStore';

export const useAuth = () => {
  const { user, isAuthenticated, isLoading, setUser, logout, checkSession } = useAuthStore();

  return {
    user,
    isAuthenticated,
    isLoading,
    setUser,
    logout,
    checkSession,
  };
};
