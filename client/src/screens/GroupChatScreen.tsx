/**
 * GroupChatScreen — realtime group chat for Duo Mode double dates.
 * Loads when a group:match socket event fires or via /group/:matchId route.
 * Supports 2–4 participants, group typing indicators, and icebreaker suggestions.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import Button from '@/components/Button';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/useAuthStore';
import { getSocket } from '@/services/socket';
import BottomNav from '@/components/BottomNav';

interface GroupMember {
  userId:      string;
  displayName: string;
  age:         number;
  avatarEmoji: string;
}

interface GroupMessage {
  id:        string;
  senderId:  string;
  content:   string;
  createdAt: string;
}

interface GroupMatchPayload {
  matchId: string;
  type:    string;
  members: GroupMember[];
}

// ---------------------------------------------------------------------------
// Group message API helpers (inline to avoid bloating api.ts further)
// ---------------------------------------------------------------------------
async function getGroupMessages(
  matchId: string,
): Promise<{ messages: GroupMessage[] }> {
  const { default: api } = await import('@/services/api');
  const res = await (api as { getGroupMessages?: (id: string) => Promise<{ messages: GroupMessage[] }> }).getGroupMessages?.(matchId)
    ?? { messages: [] as GroupMessage[] };
  return res;
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function GroupChatScreen(): React.JSX.Element {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate    = useNavigate();
  const toast       = useToast();
  const myId        = useAuthStore((s) => s.user?.id ?? '');

  const [members,  setMembers]  = useState<GroupMember[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [draft,    setDraft]    = useState('');
  const [loading,  setLoading]  = useState(true);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load members from socket store or fetch ───────────────────────────────
  useEffect(() => {
    if (!matchId) return;

    // Try to get member data from the socket payload that triggered navigation
    const socket = getSocket();
    if (!socket) { setLoading(false); return; }

    // Listen for messages in this group
    const onMessage = (payload: {
      groupMatchId: string;
      id: string;
      senderId: string;
      content: string;
      createdAt: string;
    }): void => {
      if (payload.groupMatchId !== matchId) return;
      setMessages((prev) => [
        ...prev,
        {
          id: payload.id,
          senderId: payload.senderId,
          content: payload.content,
          createdAt: payload.createdAt,
        },
      ]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    };

    const onTyping = (payload: { groupMatchId: string; userId: string; displayName: string }): void => {
      if (payload.groupMatchId !== matchId) return;
      setTypingUserIds((ids) =>
        ids.includes(payload.userId) ? ids : [...ids, payload.userId],
      );
      setTimeout(() => {
        setTypingUserIds((ids) => ids.filter((id) => id !== payload.userId));
      }, 3000);
    };

    const onGroupMatch = (payload: GroupMatchPayload): void => {
      if (payload.matchId !== matchId) return;
      setMembers(payload.members.filter((m) => m.userId !== myId));
      setLoading(false);
    };

    socket.on('group:message:received', onMessage);
    socket.on('group:typing:start', onTyping);
    socket.on('group:match', onGroupMatch);

    // Request current group info
    socket.emit('group:join', { matchId });

    // Fallback: mark loaded after 2s even if no socket response
    const fallback = setTimeout(() => setLoading(false), 2000);

    return () => {
      socket.off('group:message:received', onMessage);
      socket.off('group:typing:start', onTyping);
      socket.off('group:match', onGroupMatch);
      clearTimeout(fallback);
    };
  }, [matchId, myId]);

  // ── Auto-scroll on new messages ───────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ──────────────────────────────────────────────────────────
  const send = useCallback((): void => {
    const content = draft.trim();
    if (!content || !matchId) return;
    const socket = getSocket();
    if (!socket) { toast.error('Not connected'); return; }

    // Optimistic insert
    const optimistic: GroupMessage = {
      id:        `opt-${Date.now()}`,
      senderId:  myId,
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');

    socket.emit('group:message:send', { matchId, content });
    inputRef.current?.focus();
  }, [draft, matchId, myId, toast]);

  // ── Typing indicator ─────────────────────────────────────────────────────
  const onDraftChange = (value: string): void => {
    setDraft(value);
    const socket = getSocket();
    if (!socket || !matchId) return;
    if (typingTimer.current) clearTimeout(typingTimer.current);
    socket.emit('group:typing:start', { matchId });
    typingTimer.current = setTimeout(() => {
      socket.emit('group:typing:stop', { matchId });
    }, 2000);
  };

  const memberById = (id: string): GroupMember | undefined =>
    members.find((m) => m.userId === id);

  const typingNames = typingUserIds
    .filter((id) => id !== myId)
    .map((id) => memberById(id)?.displayName ?? 'Someone')
    .slice(0, 2);

  const GROUP_ICEBREAKERS = [
    '🗺️ Where should the four of us actually meet tonight?',
    '⚡ First round on whoever gets there last — agreed?',
    '🎲 Pick a vibe: rooftop cocktails, dive bar, or somewhere totally random?',
  ];

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: 'var(--s0)', color: 'var(--dm)' }}
      >
        <div className="text-center">
          <div className="anim-bloom mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-3xl"
            style={{ background: 'var(--hot)' }}>
            🤝
          </div>
          <p className="text-sm">Setting up your double date chat…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: 'var(--s0)', color: 'var(--tx)', paddingBottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom))' }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-30 px-4"
        style={{
          height:          'var(--hdr-h)',
          background:      'rgba(8,8,8,0.92)',
          backdropFilter:  'blur(16px)',
          borderBottom:    '0.5px solid var(--s3)',
          display:         'flex',
          alignItems:      'center',
          gap:             12,
        }}
        role="banner"
      >
        <button
          type="button"
          aria-label="Back to chats"
          onClick={() => navigate('/chats')}
          className="text-xl focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s0)] rounded"
        >
          ←
        </button>

        {/* Group avatar stack */}
        <div className="flex -space-x-2" aria-hidden="true">
          {[{ userId: myId, avatarEmoji: '👤' }, ...members].slice(0, 4).map((m, i) => (
            <span
              key={m.userId}
              className="flex h-8 w-8 items-center justify-center rounded-full text-base"
              style={{
                background: 'var(--s3)',
                border:     '2px solid var(--s0)',
                zIndex:     10 - i,
              }}
            >
              {m.avatarEmoji}
            </span>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          <p
            className="truncate font-bold text-sm"
            style={{ color: 'var(--tx)' }}
            aria-label={`Group chat with ${members.map((m) => m.displayName).join(', ')}`}
          >
            {members.length > 0
              ? `${members.map((m) => m.displayName).join(', ')}`
              : 'Double Date Group'}
          </p>
          <p
            className="text-xs"
            style={{ color: 'var(--green)' }}
            aria-live="polite"
          >
            🤝 Double date · {members.length + 1} people
          </p>
        </div>

        <div
          className="rounded-full px-2 py-0.5 text-xs font-bold"
          style={{ background: 'rgba(255,92,0,0.12)', color: 'var(--hot)' }}
          aria-label="Double date feature active"
        >
          Duo
        </div>
      </header>

      {/* Messages */}
      <main
        className="flex-1 overflow-y-auto px-4 py-4"
        role="main"
        aria-label="Group chat messages"
      >
        {/* Double date announcement */}
        <div
          className="mb-5 rounded-2xl p-4 text-center"
          style={{ background: 'rgba(255,92,0,0.06)', border: '1px solid rgba(255,92,0,0.2)' }}
          role="status"
        >
          <span className="text-3xl" aria-hidden="true">🎉</span>
          <p className="mt-2 font-bold" style={{ color: 'var(--hot)' }}>
            Double date match!
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--dm)' }}>
            All four of you matched. Time to actually go out.
          </p>
        </div>

        {/* Icebreakers (show when no messages) */}
        {messages.length === 0 && (
          <div className="mb-5" role="region" aria-label="Conversation starters">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: '#d97706' }}>
              ✨ Get the group talking
            </p>
            {GROUP_ICEBREAKERS.map((text, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setDraft(text);
                  inputRef.current?.focus();
                }}
                className="mb-2 w-full rounded-2xl px-4 py-3 text-left text-sm active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s0)]"
                style={{
                  background:      'var(--s1)',
                  border:          '0.5px solid var(--s3)',
                  color:           'var(--tx)',
                  animationDelay:  `${i * 0.12}s`,
                }}
                aria-label={`Send icebreaker: ${text}`}
              >
                {text}
              </button>
            ))}
          </div>
        )}

        {/* Message bubbles */}
        <div role="log" aria-live="polite" aria-label="Chat messages">
          {messages.map((msg) => {
            const isMe    = msg.senderId === myId;
            const sender  = memberById(msg.senderId);
            return (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isMe={isMe}
                senderEmoji={isMe ? '👤' : (sender?.avatarEmoji ?? '🤝')}
                senderName={isMe ? 'You' : (sender?.displayName ?? 'Someone')}
              />
            );
          })}
        </div>

        {/* Typing indicator */}
        {typingNames.length > 0 && (
          <div
            className="flex items-center gap-2 px-1 py-1 text-xs"
            style={{ color: 'var(--dm)' }}
            role="status"
            aria-live="polite"
            aria-label={`${typingNames.join(' and ')} ${typingNames.length === 1 ? 'is' : 'are'} typing`}
          >
            <div className="flex gap-1" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="anim-dp h-2.5 w-2.5 rounded-full"
                  style={{ background: 'var(--dm)', animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>
            <span>{typingNames.join(' & ')} typing…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      {/* Input bar */}
      <div
        className="sticky bottom-0 px-4 py-3"
        style={{
          background:    'rgba(8,8,8,0.97)',
          borderTop:     '0.5px solid var(--s3)',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        }}
        role="form"
        aria-label="Send a message"
      >
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Message the group…"
            rows={1}
            aria-label="Type your message"
            className="flex-1 resize-none rounded-xl px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--s0)]"
            style={{
              background: 'var(--s2)',
              border:     '0.5px solid var(--s4)',
              color:      'var(--tx)',
              maxHeight:  '96px',
              lineHeight: '1.5',
            }}
          />
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim()}
            aria-label="Send message"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full active:scale-90 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s0)]"
            style={{ background: draft.trim() ? 'var(--hot)' : 'var(--s3)' }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message bubble component
// ---------------------------------------------------------------------------
const MessageBubble = memo(function MessageBubble({
  msg,
  isMe,
  senderEmoji,
  senderName,
}: {
  msg:          GroupMessage;
  isMe:         boolean;
  senderEmoji:  string;
  senderName:   string;
}): React.JSX.Element {
  const time = new Date(msg.createdAt).toLocaleTimeString('en-US', {
    hour:   'numeric',
    minute: '2-digit',
  });

  return (
    <div
      className={`mb-3 flex ${isMe ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}
      role="article"
      aria-label={`${senderName}: ${msg.content}`}
    >
      {/* Avatar */}
      {!isMe && (
        <span
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm"
          style={{ background: 'var(--s3)' }}
          aria-hidden="true"
        >
          {senderEmoji}
        </span>
      )}

      <div className={`max-w-[72%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
        {!isMe && (
          <span className="mb-1 px-1 text-xs" style={{ color: 'var(--mt)' }}>
            {senderName}
          </span>
        )}
        <div
          className="rounded-2xl px-4 py-2.5 text-sm"
          style={{
            background: isMe ? 'var(--hot)' : 'var(--s2)',
            color:      isMe ? '#fff' : 'var(--tx)',
            borderRadius: isMe
              ? '18px 18px 4px 18px'
              : '18px 18px 18px 4px',
            wordBreak: 'break-word',
          }}
        >
          {msg.content}
        </div>
        <time
          className="mt-1 px-1 text-[10px]"
          style={{ color: 'var(--mt)' }}
          dateTime={msg.createdAt}
        >
          {time}
        </time>
      </div>
    </div>
  );
});
