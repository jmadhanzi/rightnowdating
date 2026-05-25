import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import ChatSkeleton from '@/components/skeletons/ChatSkeleton';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore, type StoredMessage } from '@/store/useChatStore';
import { getChatMessages, getMatch, type MatchData } from '@/services/api';
import { emitTyping, getSocket, sendMessage } from '@/services/socket';

const TYPING_THROTTLE_MS = 3000;

const ChatMessage = memo(function ChatMessage({
  message,
  mine,
  showTime,
  onToggleTime,
}: {
  message: StoredMessage;
  mine: boolean;
  showTime: boolean;
  onToggleTime: (id: string) => void;
}): React.JSX.Element {
  return (
    <div className={mine ? 'flex justify-end' : 'flex justify-start'}>
      <div className="max-w-[75%]">
        <button
          type="button"
          onClick={() => onToggleTime(message.id)}
          className="block rounded-2xl px-3 py-2 text-left text-sm"
          style={{
            background: mine ? 'var(--hot)' : 'var(--s2)',
            color: mine ? '#fff' : 'var(--tx)',
          }}
        >
          {message.isFlagged ? (
            <span className="italic" style={{ color: mine ? '#ffe' : 'var(--mt)' }}>
              Message blocked by safety system
            </span>
          ) : (
            message.content
          )}
        </button>
        {showTime && (
          <p
            className={`mt-0.5 text-[10px] ${mine ? 'text-right' : 'text-left'}`}
            style={{ color: 'var(--mt)' }}
          >
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </div>
    </div>
  );
});

export default function ChatScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const { matchId } = useParams<{ matchId: string }>();
  const myId = useAuthStore((s) => s.user?.id);

  const conversation = useChatStore((s) => (matchId ? s.conversations[matchId] : undefined));
  const setMessages = useChatStore((s) => s.setMessages);
  const addMessage = useChatStore((s) => s.addMessage);
  const setActiveMatch = useChatStore((s) => s.setActiveMatch);

  const [match, setMatch] = useState<MatchData | null>(null);
  const [draft, setDraft] = useState('');
  const [theyTyping, setTheyTyping] = useState(false);
  const [showTime, setShowTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastTypingRef = useRef(0);
  const typingHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messages = conversation?.messages ?? [];

  // Load history + match meta; mark active.
  useEffect(() => {
    if (!matchId) return;
    setActiveMatch(matchId);
    setLoading(true);
    getChatMessages(matchId)
      .then((r) => setMessages(matchId, r.messages))
      .catch(() => toast.error('Could not load messages'))
      .finally(() => setLoading(false));
    getMatch(matchId)
      .then(setMatch)
      .catch(() => undefined);
    return () => setActiveMatch(null);
  }, [matchId, setActiveMatch, setMessages, toast]);

  // Typing indicator from the other user.
  useEffect(() => {
    const socket = getSocket();
    const onTyping = (payload: { matchId: string; userId: string }): void => {
      if (payload.matchId !== matchId || payload.userId === myId) return;
      setTheyTyping(true);
      if (typingHideRef.current) clearTimeout(typingHideRef.current);
      typingHideRef.current = setTimeout(() => setTheyTyping(false), 3000);
    };
    socket.on('typing:start', onTyping);
    return () => {
      socket.off('typing:start', onTyping);
    };
  }, [matchId, myId]);

  // Scroll to bottom on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, theyTyping]);

  const toggleTime = useCallback((id: string): void => {
    setShowTime((t) => (t === id ? null : id));
  }, []);

  const onDraftChange = (value: string): void => {
    setDraft(value);
    const now = Date.now();
    if (matchId && now - lastTypingRef.current > TYPING_THROTTLE_MS) {
      lastTypingRef.current = now;
      emitTyping(matchId);
    }
  };

  const send = (): void => {
    const content = draft.trim();
    if (!content || !matchId || !myId) return;
    sendMessage(matchId, content);
    addMessage(matchId, {
      id: `local-${Date.now()}`,
      matchId,
      senderId: myId,
      content,
      createdAt: new Date().toISOString(),
    });
    setDraft('');
  };

  const statusText = match?.status === 'met' ? 'At venue' : 'En route';

  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--s0)', color: 'var(--tx)' }}>
      <header
        className="sticky top-0 z-30 flex items-center gap-3 px-4"
        style={{
          height: 'var(--hdr-h)',
          background: 'rgba(8,8,8,0.9)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <button type="button" onClick={() => navigate('/chats')} className="text-xl">
          ←
        </button>
        <span className="text-2xl">{match?.other.emoji ?? '🧑'}</span>
        <div className="flex-1">
          <p className="font-bold leading-tight">{match?.other.displayName ?? 'Chat'}</p>
          <p className="text-xs" style={{ color: 'var(--green)' }}>
            {statusText}
          </p>
        </div>
      </header>

      <p className="py-1 text-center text-[11px]" style={{ color: 'var(--mt)' }}>
        Messages delete 24 hours after your date
      </p>

      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {loading && messages.length === 0 && <ChatSkeleton />}
        {messages.map((m) => (
          <ChatMessage
            key={m.id}
            message={m}
            mine={m.senderId === myId}
            showTime={showTime === m.id}
            onToggleTime={toggleTime}
          />
        ))}

        {theyTyping && (
          <div className="flex justify-start">
            <div className="flex gap-1 rounded-2xl px-3 py-3" style={{ background: 'var(--s2)' }}>
              {[0, 0.2, 0.4].map((d) => (
                <span
                  key={d}
                  className="anim-dp h-2 w-2 rounded-full"
                  style={{ background: 'var(--dm)', animationDelay: `${d}s` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="sticky bottom-0 flex items-center gap-2 px-4 py-3"
        style={{
          background: 'rgba(8,8,8,0.9)',
          backdropFilter: 'blur(16px)',
          borderTop: '1px solid var(--s3)',
        }}
      >
        <input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a message"
          className="flex-1 rounded-full px-4 py-3 outline-none"
          style={{ background: 'var(--s2)', border: '1px solid var(--s4)', color: 'var(--tx)' }}
        />
        <button
          type="button"
          onClick={send}
          className="flex h-11 w-11 items-center justify-center rounded-full active:scale-95"
          style={{ background: 'linear-gradient(135deg, var(--hot), #ff8c00)', color: '#fff' }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
