import axios from 'axios';
import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { createAuthenticatedApi } from '@aeg/web-shared/auth';
import type { CustomsUser } from '../types';

const TOKEN_KEY = 'aeg_customs_token';
const USER_KEY = 'aeg_customs_user';
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL
  || (Capacitor.isNativePlatform() ? 'https://customs.linsgeekai.com.br' : '')
).replace(/\/+$/, '');

function storedUser(): CustomsUser | null {
  try {
    const value = localStorage.getItem(USER_KEY);
    const user = value ? JSON.parse(value) as CustomsUser : null;
    return user?.role === 'customs' ? user : null;
  } catch {
    return null;
  }
}

interface AuthState {
  token: string | null;
  user: CustomsUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const initialUser = storedUser();
const initialToken = initialUser ? localStorage.getItem(TOKEN_KEY) : null;
if (!initialUser) {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export const useAuth = create<AuthState>((set) => ({
  token: initialToken,
  user: initialUser,
  login: async (username, password) => {
    const response = await axios.post(`${API_BASE_URL}/api/auth/login`, { username, password });
    const { access_token, user } = response.data as { access_token: string; user: CustomsUser };
    if (user.role !== 'customs') {
      throw new Error('Esta conta não tem acesso ao portal de despacho aduaneiro.');
    }
    localStorage.setItem(TOKEN_KEY, access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ token: access_token, user });
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ token: null, user: null });
  }
}));

export const api = createAuthenticatedApi({
  tokenKey: TOKEN_KEY,
  userKey: USER_KEY,
  onUnauthorized: () => {
    if (Capacitor.isNativePlatform()) {
      window.location.assign('#/login');
      return;
    }
    const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
    window.location.assign(`${base}/login`.replace('//login', '/login'));
  }
});
api.defaults.baseURL = API_BASE_URL;

export function errorMessage(error: unknown, fallback = 'Não foi possível concluir a operação.') {
  if (axios.isAxiosError(error)) return fallback;
  return error instanceof Error ? error.message : fallback;
}
