/**
 * Axios singleton — single instance used everywhere in the app.
 *
 * Base URL comes from VITE_API_URL env var (defaults to localhost:8000).
 * Request interceptor: attaches the JWT access token from localStorage.
 * Response interceptor: catches 401, attempts a silent token refresh, and
 * retries the original request. If refresh also fails, clears auth and
 * redirects to /login.
 */
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'https://smartroadsafety-1.onrender.com/';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

export const getAccessToken = () => localStorage.getItem('access');
export const getRefreshToken = () => localStorage.getItem('refresh');

export const setTokens = ({ access, refresh }) => {
  if (access) localStorage.setItem('access', access);
  if (refresh) localStorage.setItem('refresh', refresh);
};

export const clearTokens = () => {
  localStorage.removeItem('access');
  localStorage.removeItem('refresh');
  localStorage.removeItem('user');
};

// ---------------------------------------------------------------------------
// Request interceptor — attach Bearer token
// ---------------------------------------------------------------------------

api.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ---------------------------------------------------------------------------
// Response interceptor — auto-refresh on 401
// ---------------------------------------------------------------------------

let isRefreshing = false;
let refreshQueue = [];

/**
 * Process all queued requests after a successful token refresh.
 */
const processQueue = (error = null) => {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve();
  });
  refreshQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // 401 && not already retried → attempt refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        })
          .then(() => api(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refresh = getRefreshToken();
      if (!refresh) {
        // No refresh token → clear and redirect
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${BASE_URL}/api/auth/token/refresh/`, {
          refresh,
        });
        setTokens({ access: data.access });
        processQueue();
        return api(originalRequest);
      } catch {
        processQueue(new Error('Refresh failed'));
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
