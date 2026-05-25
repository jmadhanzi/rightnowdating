import { create } from 'zustand';
import type { User, Vibe, TimeWindow } from '@rightnow/shared';

interface AppState {
  user: User | null;
  accessToken: string | null;
  selectedVibe: Vibe;
  timeWindow: TimeWindow;
  isLive: boolean;

  setUser: (user: User | null) => void;
  setAccessToken: (token: string | null) => void;
  setVibe: (vibe: Vibe) => void;
  setTimeWindow: (window: TimeWindow) => void;
  setLive: (isLive: boolean) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  accessToken: null,
  selectedVibe: 'walk',
  timeWindow: '1h',
  isLive: false,

  setUser: (user) => set({ user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setVibe: (selectedVibe) => set({ selectedVibe }),
  setTimeWindow: (timeWindow) => set({ timeWindow }),
  setLive: (isLive) => set({ isLive }),
  reset: () => set({ user: null, accessToken: null, isLive: false }),
}));
