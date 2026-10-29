import { create } from 'zustand';
import axios from 'axios';
import type { Role } from '@aeg/shared-types';

interface User { id: string; username: string; role: Role; client_id?: string; }
interface AuthState { token: string | null; user: User | null; login: (u: string, p: string) => Promise<void>; logout: () => void; }
const TOKEN_KEY = 'aeg_client_token';
const USER_KEY = 'aeg_client_user';
export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_KEY),
  user: (() => { const s = localStorage.getItem(USER_KEY); return s ? JSON.parse(s) : null; })(),
  login: async (username, password) => {
    const res = await axios.post('/api/auth/login', { username, password });
    const { access_token, user } = res.data;
    localStorage.setItem(TOKEN_KEY, access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ token: access_token, user });
  },
  logout: () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); set({ token: null, user: null }); }
}));
export const api = axios.create();
api.interceptors.request.use((c) => { const t = localStorage.getItem(TOKEN_KEY); if (t) c.headers.Authorization = `Bearer ${t}`; return c; });
api.interceptors.response.use((r) => r, (e) => { if (e.response?.status === 401) { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); window.location.href = '/login'; } return Promise.reject(e); });
