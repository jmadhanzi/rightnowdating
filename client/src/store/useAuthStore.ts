import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  verifyOtp as apiVerifyOtp,
  refresh as apiRefresh,
  logout as apiLogout,
  type VerifyOtpResponse,
} from '@/services/api';

const REFRESH_TOKEN_KEY = 'rightnow.refreshToken';

export interface AuthUser {
  id: string;
  phone: string;
  displayName?: string;
  emoji?: string;
  trustScore?: number;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (phone: string, otp: string) => Promise<VerifyOtpResponse>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<string>;
  setUser: (user: Partial<AuthUser>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (phone, otp) => {
        set({ isLoading: true });
        try {
          const res = await apiVerifyOtp(phone, otp);
          localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
          set({
            user: { id: res.userId, phone },
            accessToken: res.accessToken,
            isAuthenticated: true,
            isLoading: false,
          });
          return res;
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        if (refreshToken) {
          await apiLogout(refreshToken).catch(() => undefined);
        }
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
      },

      refreshToken: async () => {
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
        if (!refreshToken) throw new Error('No refresh token available');
        const res = await apiRefresh(refreshToken);
        // Persist the rotated refresh token the server issued.
        localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
        set({ accessToken: res.accessToken });
        return res.accessToken;
      },

      setUser: (user) => {
        const current = get().user;
        set({ user: current ? { ...current, ...user } : (user as AuthUser) });
      },
    }),
    {
      name: 'rightnow-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
