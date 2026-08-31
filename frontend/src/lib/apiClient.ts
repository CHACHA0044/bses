import axios from 'axios';

export const apiClient = axios.create({
  baseURL: process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000/api',
  withCredentials: true, // Send HTTP-Only cookies
  timeout: 10_000, // No request may hang indefinitely — reject after 10s
});

// Set Content-Type: application/json only when sending body data (POST/PUT/PATCH),
// preventing unexpected CORS preflight checks or header mismatches on GET/blob requests.
apiClient.interceptors.request.use((config) => {
  if (config.data && !(config.data instanceof FormData) && !config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json';
  }
  return config;
});

/**
 * Single-flight refresh: several page payloads often 401 in parallel after an
 * access token expires. All of them share ONE refresh call instead of each
 * firing its own — fewer round-trips, and no refresh/race churn during
 * navigation.
 */
let refreshPromise: Promise<unknown> | null = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle token refresh automatically if 401 occurs and request hasn't been retried
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/auth/login') && !originalRequest.url?.includes('/auth/refresh')) {
      originalRequest._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = apiClient.post('/auth/refresh').finally(() => {
            refreshPromise = null;
          });
        }
        await refreshPromise;
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
