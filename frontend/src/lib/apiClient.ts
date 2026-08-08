import axios from 'axios';

export const apiClient = axios.create({
  baseURL: process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000/api',
  withCredentials: true, // Send HTTP-Only cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle token refresh automatically if 401 occurs and request hasn't been retried
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/auth/login') && !originalRequest.url?.includes('/auth/refresh')) {
      originalRequest._retry = true;
      try {
        await apiClient.post('/auth/refresh');
        return apiClient(originalRequest);
      } catch (refreshErr) {
        // Session expired — redirect to session expired page if in browser
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/session-expired';
        }
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  },
);
