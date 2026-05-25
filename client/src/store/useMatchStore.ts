import { create } from 'zustand';
import type { SparkReceivedPayload, MatchCreatedPayload } from '@rightnow/shared';

interface MatchState {
  pendingSparks: SparkReceivedPayload[];
  activeMatch: MatchCreatedPayload | null;
  matchTimer: number;

  addSpark: (spark: SparkReceivedPayload) => void;
  removeSpark: (sparkId: string) => void;
  setActiveMatch: (match: MatchCreatedPayload | null) => void;
  setMatchTimer: (seconds: number) => void;
  clearMatch: () => void;
}

export const useMatchStore = create<MatchState>((set) => ({
  pendingSparks: [],
  activeMatch: null,
  matchTimer: 0,

  addSpark: (spark) =>
    set((state) => {
      if (state.pendingSparks.some((s) => s.sparkId === spark.sparkId)) return state;
      return { pendingSparks: [...state.pendingSparks, spark] };
    }),

  removeSpark: (sparkId) =>
    set((state) => ({ pendingSparks: state.pendingSparks.filter((s) => s.sparkId !== sparkId) })),

  setActiveMatch: (activeMatch) => set({ activeMatch, matchTimer: activeMatch?.countdown ?? 0 }),

  setMatchTimer: (matchTimer) => set({ matchTimer }),

  clearMatch: () => set({ activeMatch: null, matchTimer: 0 }),
}));
