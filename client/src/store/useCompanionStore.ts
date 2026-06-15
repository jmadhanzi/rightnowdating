import { create } from 'zustand';

export type RelationshipStage = 1 | 2 | 3 | 4 | 5 | 6;

export const STAGE_LABELS: Record<RelationshipStage, string> = {
  1: 'Discovery',
  2: 'Trust',
  3: 'Friendship',
  4: 'Attachment',
  5: 'Deep Bond',
  6: 'Long-Term',
};

export const STAGE_COLORS: Record<RelationshipStage, string> = {
  1: '#6b7280',
  2: '#8b5cf6',
  3: '#3b82f6',
  4: '#10b981',
  5: '#f59e0b',
  6: '#ef4444',
};

export interface CompanionMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface EpisodicMemory {
  id: string;
  sessionDate: string;
  summary: string;
  emotionalTone: string;
  salienceScore: number;
  keyTopics: string[];
}

export interface CompanionProfile {
  companionName: string;
  companionType: string;
  relationshipStage: RelationshipStage;
  sessionCount: number;
  moodToday: string;
  lifeThreads: Array<{ id: string; title: string; progress: number }>;
  attachmentScore: number;
  firstSessionAt: string | null;
  lastSessionAt: string | null;
  milestones: Array<{ type: string; reachedAt: string; label: string }>;
  insideJokes: Array<{ text: string; createdAt: string }>;
  longTermMemory: Array<{ key: string; value: string; type: string }>;
  recentMemories: EpisodicMemory[];
  isOnboarded: boolean;
}

interface CompanionState {
  profile: CompanionProfile | null;
  messages: CompanionMessage[];
  memoryBook: EpisodicMemory[];
  isTyping: boolean;
  isLoading: boolean;
  proactiveMessage: string | null;

  setProfile: (profile: CompanionProfile | null) => void;
  setMessages: (messages: CompanionMessage[]) => void;
  addMessage: (message: CompanionMessage) => void;
  setMemoryBook: (memories: EpisodicMemory[]) => void;
  setTyping: (typing: boolean) => void;
  setLoading: (loading: boolean) => void;
  setProactiveMessage: (msg: string | null) => void;
  updateStage: (stage: RelationshipStage) => void;
}

export const useCompanionStore = create<CompanionState>((set) => ({
  profile: null,
  messages: [],
  memoryBook: [],
  isTyping: false,
  isLoading: false,
  proactiveMessage: null,

  setProfile: (profile) => set({ profile }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  setMemoryBook: (memoryBook) => set({ memoryBook }),
  setTyping: (isTyping) => set({ isTyping }),
  setLoading: (isLoading) => set({ isLoading }),
  setProactiveMessage: (proactiveMessage) => set({ proactiveMessage }),
  updateStage: (stage) =>
    set((s) => ({
      profile: s.profile ? { ...s.profile, relationshipStage: stage } : null,
    })),
}));
