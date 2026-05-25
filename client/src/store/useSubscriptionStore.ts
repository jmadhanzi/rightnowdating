import { create } from 'zustand';

export type Plan = 'free' | 'plus' | 'vip';

interface SubscriptionState {
  plan: Plan;
  boostCredits: number;
  trialDaysLeft: number;

  setPlan: (plan: Plan) => void;
  setBoostCredits: (credits: number) => void;
  setTrialDaysLeft: (days: number) => void;
  useBoost: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  plan: 'free',
  boostCredits: 0,
  trialDaysLeft: 0,

  setPlan: (plan) => set({ plan }),
  setBoostCredits: (boostCredits) => set({ boostCredits }),
  setTrialDaysLeft: (trialDaysLeft) => set({ trialDaysLeft }),
  useBoost: () => set((state) => ({ boostCredits: Math.max(0, state.boostCredits - 1) })),
}));
