import { create } from 'zustand';
import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import { createAuthenticatedApi } from '@aeg/web-shared/auth';
import type { Role } from '@aeg/shared-types';

interface User { id: string; username: string; role: Role; client_id?: string; }
interface AuthState { token: string | null; user: User | null; login: (u: string, p: string) => Promise<void>; logout: () => void; }
const TOKEN_KEY = 'aeg_client_token';
const USER_KEY = 'aeg_client_user';
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL
  || (Capacitor.isNativePlatform() ? 'https://app.linsgeekai.com.br' : '')
).replace(/\/+$/, '');
export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_KEY),
  user: (() => { const s = localStorage.getItem(USER_KEY); return s ? JSON.parse(s) : null; })(),
  login: async (username, password) => {
    const res = await axios.post(`${API_BASE_URL}/api/auth/login`, { username, password });
    const { access_token, user } = res.data;
    localStorage.setItem(TOKEN_KEY, access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ token: access_token, user });
  },
  logout: () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); set({ token: null, user: null }); }
}));
export const api = createAuthenticatedApi({
  tokenKey: TOKEN_KEY,
  userKey: USER_KEY,
  onUnauthorized: () => {
    window.location.href = Capacitor.isNativePlatform() ? '#/login' : '/login';
  }
});
api.defaults.baseURL = API_BASE_URL;
