import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useToast } from '@/hooks/useToast';
import { useCompanionStore, STAGE_LABELS, STAGE_COLORS, type RelationshipStage } from '@/store/useCompanionStore';
import {
  getCompanionProfile,
  getCompanionMessages,
  sendCompanionMessage,
  getCompanionProactiveMessage,
} from '@/services/api';

const MOOD_EMOJIS: Record<string, string> = {
  content: '😌',
  curious: '🤔',
  playful: '😄',
  reflective: '🌙',
  energetic: '⚡',
  tired: '😴',
  happy: '😊',
  excited: '🎉',
};

const STAGE_DESCRIPTIONS: Record<RelationshipStage, string> = {
  1: 'Just getting started',
  2: 'Building trust',
  3: 'Good friends',
  4: 'Close bond',
  5: 'Deep connection',
  6: 'Long-term companion',
};

export default function CompanionChatScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();

  const profile = useCompanionStore((s) => s.profile);
  const messages = useCompanionStore((s) => s.messages);
  const isTyping = useCompanionStore((s) => s.isTyping);
  const isLoading = useCompanionStore((s) => s.isLoading);
  const proactiveMessage = useCompanionStore((s) => s.proactiveMessage);
  const setProfile = useCompanionStore((s) => s.setProfile);
  const setMessages = useCompanionStore((s) => s.setMessages);
  const addMessage = useCompanionStore((s) => s.addMessage);
  const setTyping = useCompanionStore((s) => s.setTyping);
  const setLoading = useCompanionStore((s) => s.setLoading);
  const setProactiveMessage = useCompanionStore((s) => s.setProactiveMessage);
  const updateStage = useCompanionStore((s) => s.updateStage);

  const [draft, setDraft] = useState('');
  const [milestone, setMilestone] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Load profile + messages on mount
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [profileData, msgData, proactiveData] = await Promise.all([
          getCompanionProfile(),
          getCompanionMessages(50),
          getCompanionProactiveMessage(),
        ]);

        if (!profileData.isOnboarded) {
          navigate('/companion/onboard', { replace: true });
          return;
        }

        setProfile(profileData);
        setMessages(msgData.messages);

        if (proactiveData.message) {
          setProactiveMessage(proactiveData.message);
        }
      } catch {
        toast.error('Could not load your companion');
      } finally {
        setLoading(false);
      }
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || isTyping) return;

    setDraft('');
    setProactiveMessage(null);

    // Optimistically add user message
    const tempId = `tmp-${Date.now()}`;
    addMessage({ id: tempId, role: 'user', content: text, createdAt: new Date().toISOString() });
    setTyping(true);

    try {
      const res = await sendCompanionMessage(text);

      addMessage({
        id: `${Date.now()}-reply`,
        role: 'assistant',
        content: res.reply,
        createdAt: new Date().toISOString(),
      });

      if (res.stageAdvanced) {
        updateStage(
          Math.min(6, (profile?.relationshipStage ?? 1) + 1) as RelationshipStage,
        );
        if (res.milestone) setMilestone(res.milestone);
      }
    } catch {
      toast.error('Could not reach your companion right now');
    } finally {
      setTyping(false);
    }
  }, [draft, isTyping, profile, addMessage, setTyping, setProactiveMessage, updateStage, toast]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const acceptProactive = () => {
    if (!proactiveMessage) return;
    addMessage({
      id: `proactive-${Date.now()}`,
      role: 'assistant',
      content: proactiveMessage,
      createdAt: new Date().toISOString(),
    });
    setProactiveMessage(null);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--s0)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full animate-pulse" style={{ background: '#7c3aed40' }} />
          <p className="text-sm" style={{ color: 'var(--mt)' }}>Loading your companion...</p>
        </div>
      </div>
    );
  }

  const stage = (profile?.relationshipStage ?? 1) as RelationshipStage;
  const stageColor = STAGE_COLORS[stage];

  return (
    <div
      className="flex flex-col"
      style={{
        height: '100dvh',
        background: 'var(--s0)',
        color: 'var(--tx)',
      }}
    >
      {/* Header */}
      <header
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
          background: 'rgba(14,14,14,0.97)',
          backdropFilter: 'blur(20px)',
          borderBottom: '0.5px solid var(--s3)',
        }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ background: 'var(--s2)' }}
          aria-label="Go back"
        >
          ←
        </button>

        {/* Companion avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0"
          style={{ background: `linear-gradient(135deg, #7c3aed, #a78bfa)`, color: '#fff' }}
        >
          {profile?.companionName?.[0]?.toUpperCase() ?? '?'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold truncate">{profile?.companionName ?? 'Your companion'}</span>
            <span className="text-xs">{MOOD_EMOJIS[profile?.moodToday ?? 'content'] ?? '😌'}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: stageColor }}
            />
            <span className="text-[11px]" style={{ color: 'var(--mt)' }}>
              {STAGE_LABELS[stage]} · {STAGE_DESCRIPTIONS[stage]}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/companion/memory-book')}
          className="flex flex-col items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide px-2"
          style={{ color: '#7c3aed' }}
          aria-label="Memory book"
        >
          <span className="text-lg">📖</span>
          <span>Memory</span>
        </button>
      </header>

      {/* Milestone toast */}
      {milestone && (
        <div
          className="mx-4 mt-3 rounded-xl px-4 py-3 flex items-center gap-3 shrink-0"
          style={{ background: `${stageColor}20`, border: `1px solid ${stageColor}40` }}
        >
          <span className="text-xl">🎉</span>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: stageColor }}>
              {STAGE_LABELS[stage]} reached!
            </p>
            <p className="text-xs" style={{ color: 'var(--mt)' }}>{milestone}</p>
          </div>
          <button
            type="button"
            onClick={() => setMilestone(null)}
            className="text-lg"
            style={{ color: 'var(--mt)' }}
          >
            ×
          </button>
        </div>
      )}

      {/* Proactive message banner */}
      {proactiveMessage && messages.length > 0 && (
        <div
          className="mx-4 mt-3 rounded-xl px-4 py-3 flex items-start gap-3 shrink-0"
          style={{ background: '#7c3aed15', border: '1px solid #7c3aed30' }}
        >
          <span className="text-xl mt-0.5">💜</span>
          <div className="flex-1">
            <p className="text-sm" style={{ color: 'var(--tx)' }}>{proactiveMessage}</p>
          </div>
          <button
            type="button"
            onClick={acceptProactive}
            className="text-xs font-semibold px-2 py-1 rounded-lg shrink-0"
            style={{ background: '#7c3aed', color: '#fff' }}
          >
            Show
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && !isTyping && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl mb-4 font-bold"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: '#fff' }}
            >
              {profile?.companionName?.[0]?.toUpperCase() ?? '?'}
            </div>
            <p className="font-semibold mb-1">{profile?.companionName} is here</p>
            <p className="text-sm" style={{ color: 'var(--mt)' }}>
              Say hi — they remember everything you share.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mr-2 shrink-0 mt-auto"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: '#fff' }}
              >
                {profile?.companionName?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <div className="max-w-[78%]">
              <div
                className="rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed"
                style={
                  msg.role === 'user'
                    ? { background: '#7c3aed', color: '#fff', borderBottomRightRadius: 4 }
                    : { background: 'var(--s2)', color: 'var(--tx)', borderBottomLeftRadius: 4 }
                }
              >
                {msg.content}
              </div>
              <p
                className={`text-[10px] mt-0.5 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
                style={{ color: 'var(--mt)' }}
              >
                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mr-2 shrink-0"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: '#fff' }}
            >
              {profile?.companionName?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div
              className="rounded-2xl px-4 py-3 flex gap-1 items-center"
              style={{ background: 'var(--s2)', borderBottomLeftRadius: 4 }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: '#7c3aed', animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="shrink-0 px-4 py-3 flex items-end gap-2"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
          background: 'rgba(14,14,14,0.97)',
          borderTop: '0.5px solid var(--s3)',
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          placeholder={`Message ${profile?.companionName ?? 'your companion'}...`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
          }}
          onKeyDown={handleKeyDown}
          disabled={isTyping}
          className="flex-1 rounded-2xl px-4 py-2.5 text-sm resize-none outline-none"
          style={{
            background: 'var(--s2)',
            border: '1.5px solid var(--s4)',
            color: 'var(--tx)',
            maxHeight: 120,
            lineHeight: '1.4',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = '#7c3aed')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--s4)')}
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!draft.trim() || isTyping}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg transition-all"
          style={{
            background: draft.trim() && !isTyping ? '#7c3aed' : 'var(--s3)',
            color: draft.trim() && !isTyping ? '#fff' : 'var(--mt)',
          }}
          aria-label="Send message"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
