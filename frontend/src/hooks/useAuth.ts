import { useAuthStore } from '@/store/authStore';

export const useAuth = () => {
  const { user, isAuthenticated, isLoading, isLoadingLogout, setUser, logout, checkSession, resetLogoutState } = useAuthStore();

  return {
    user,
    isAuthenticated,
    isLoading,
    isLoadingLogout,
    setUser,
    logout,
    checkSession,
    resetLogoutState,
  };
};
