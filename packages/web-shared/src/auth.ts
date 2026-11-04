import axios from 'axios';

interface AuthenticatedApiOptions {
  tokenKey: string;
  userKey: string;
  onUnauthorized?: () => void;
}

export function createAuthenticatedApi({ tokenKey, userKey, onUnauthorized }: AuthenticatedApiOptions) {
  const api = axios.create();
  api.interceptors.request.use((config) => {
    const token = localStorage.getItem(tokenKey);
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        localStorage.removeItem(tokenKey);
        localStorage.removeItem(userKey);
        if (onUnauthorized) onUnauthorized();
        else window.location.href = '/login';
      }
      return Promise.reject(error);
    }
  );
  return api;
}
