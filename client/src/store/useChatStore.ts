import { create } from 'zustand';
import type { MessageReceivedPayload } from '@rightnow/shared';

export interface Conversation {
  messages: MessageReceivedPayload[];
  unread: number;
}

interface ChatState {
  conversations: Record<string, Conversation>;
  activeMatchId: string | null;

  addMessage: (matchId: string, message: MessageReceivedPayload) => void;
  setActiveMatch: (matchId: string | null) => void;
  markRead: (matchId: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: {},
  activeMatchId: null,

  addMessage: (matchId, message) =>
    set((state) => {
      const existing = state.conversations[matchId] ?? { messages: [], unread: 0 };
      const isActive = state.activeMatchId === matchId;
      return {
        conversations: {
          ...state.conversations,
          [matchId]: {
            messages: [...existing.messages, message],
            unread: isActive ? 0 : existing.unread + 1,
          },
        },
      };
    }),

  setActiveMatch: (matchId) => {
    set({ activeMatchId: matchId });
    if (matchId) get().markRead(matchId);
  },

  markRead: (matchId) =>
    set((state) => {
      const convo = state.conversations[matchId];
      if (!convo) return state;
      return {
        conversations: { ...state.conversations, [matchId]: { ...convo, unread: 0 } },
      };
    }),
}));
