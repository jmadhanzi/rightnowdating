import { create } from 'zustand';
import type { MapPinPayload, Vibe } from '@rightnow/shared';

export interface StoredPin extends MapPinPayload {
  expiresAt?: number; // epoch ms, optional
}

export interface MySession {
  sessionId: string;
  vibe: Vibe;
  expiresAt: string;
}

interface MapState {
  nearbyPins: StoredPin[];
  mySession: MySession | null;
  cityCount: number;

  addPin: (pin: StoredPin) => void;
  removePin: (sessionId: string) => void;
  updatePin: (sessionId: string, updates: Partial<StoredPin>) => void;
  setMySession: (session: MySession | null) => void;
  setCityCount: (count: number) => void;
  clearExpired: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  nearbyPins: [],
  mySession: null,
  cityCount: 0,

  addPin: (pin) =>
    set((state) => {
      const exists = state.nearbyPins.some((p) => p.sessionId === pin.sessionId);
      return exists
        ? { nearbyPins: state.nearbyPins.map((p) => (p.sessionId === pin.sessionId ? pin : p)) }
        : { nearbyPins: [...state.nearbyPins, pin] };
    }),

  removePin: (sessionId) =>
    set((state) => ({ nearbyPins: state.nearbyPins.filter((p) => p.sessionId !== sessionId) })),

  updatePin: (sessionId, updates) =>
    set((state) => ({
      nearbyPins: state.nearbyPins.map((p) =>
        p.sessionId === sessionId ? { ...p, ...updates } : p,
      ),
    })),

  setMySession: (mySession) => set({ mySession }),
  setCityCount: (cityCount) => set({ cityCount }),

  clearExpired: () =>
    set((state) => {
      const now = Date.now();
      return {
        nearbyPins: state.nearbyPins.filter((p) => p.expiresAt === undefined || p.expiresAt > now),
      };
    }),
}));
