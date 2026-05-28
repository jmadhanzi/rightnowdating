import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Avatar from '@/components/Avatar';
import Button from '@/components/Button';
import BottomNav from '@/components/BottomNav';
import CountdownTimer from '@/components/CountdownTimer';
import { useToast } from '@/hooks/useToast';
import { getChats, type Conversation } from '@/services/api';
import { useChatStore } from '@/store/useChatStore';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export default function ChatsScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const conversationsState = useChatStore((s) => s.conversations);
  const [chats, setChats] = useState<Conversation[] | null>(null);

  useEffect(() => {
    getChats()
      .then((r) => setChats(r.conversations))
      .catch(() => {
        toast.error('Could not load chats');
        setChats([]);
      });
  }, [toast]);

  const active = (chats ?? []).filter((c) => c.isActive);
  const recent = (chats ?? []).filter((c) => !c.isActive);

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: 'var(--s0)', color: 'var(--tx)', paddingBottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom))' }}
    >
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-5"
        role="banner"
        style={{
          height: 'var(--hdr-h)',
          background: 'rgba(8,8,8,0.92)',
          backdropFilter: 'blur(16px)',
          borderBottom: '0.5px solid var(--s3)',
        }}
      >
        <button
          type="button"
          aria-label="Open menu"
          className="text-xl focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s0)] rounded min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          ☰
        </button>
        <h1
          className="font-display text-xl font-extrabold italic tracking-tight"
          style={{ color: 'var(--hot)' }}
          aria-label="RIGHTNOW — your chats"
        >
          RIGHTNOW
        </h1>
        <button
          type="button"
          aria-label="Search chats"
          className="text-xl focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s0)] rounded min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          🔍
        </button>
      </header>

      <div className="flex-1 px-5 py-4">
        {chats !== null && chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-6xl">💬</span>
            <h2 className="mt-4 font-display text-2xl font-bold">No dates yet</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--dm)' }}>
              Go live to meet someone
            </p>
            <div className="mt-6 w-48">
              <Button fullWidth size="lg" onClick={() => navigate('/live')}>
                GO LIVE
              </Button>
            </div>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <>
                <p
                  className="mb-2 text-xs font-bold uppercase tracking-widest"
                  style={{ color: 'var(--dm)' }}
                >
                  Active Date
                </p>
                {active.map((c) => (
                  <button
                    key={c.matchId}
                    type="button"
                    onClick={() => navigate(`/chat/${c.matchId}`)}
                    aria-label={`Open chat with ${c.partner.displayName}. Last message: ${c.lastMessage?.content ?? 'No messages yet'}`}
                    className="mb-3 flex w-full items-center gap-3 rounded-2xl p-3 text-left focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s0)]"
                    style={{ background: 'var(--s1)', border: '1px solid var(--green)' }}
                  >
                    <Avatar
                      emoji={c.partner.emoji}
                      size="md"
                      showOnline
                      trustScore={c.partner.trustScore}
                    />
                    <div className="flex-1">
                      <p className="font-bold">{c.partner.displayName}</p>
                      <p className="truncate text-sm" style={{ color: 'var(--dm)' }}>
                        {c.lastMessage?.content ?? 'Say hi 👋'}
                      </p>
                    </div>
                    {c.meetupTime && (
                      <span className="text-sm font-bold" style={{ color: 'var(--green)' }}>
                        <CountdownTimer expiresAt={Date.parse(c.meetupTime)} variant="meetup" />
                      </span>
                    )}
                  </button>
                ))}
                <div className="my-3 h-px w-full" style={{ background: 'var(--s3)' }} />
              </>
            )}

            {recent.length > 0 && (
              <p
                className="mb-2 text-xs font-bold uppercase tracking-widest"
                style={{ color: 'var(--dm)' }}
              >
                Recent
              </p>
            )}
            {recent.map((c) => {
              const unread = conversationsState[c.matchId]?.unread ?? 0;
              return (
                <button
                  key={c.matchId}
                  type="button"
                  onClick={() => navigate(`/chat/${c.matchId}`)}
                  aria-label={`${c.partner.displayName}${unread > 0 ? `, ${unread} unread message${unread > 1 ? 's' : ''}` : ''}. Last: ${c.lastMessage?.content ?? 'No messages yet'}`}
                  className="mb-2 flex w-full items-center gap-3 rounded-2xl p-3 text-left focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s0)]"
                  style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
                >
                  <div className="relative">
                    <Avatar emoji={c.partner.emoji} size="md" trustScore={c.partner.trustScore} />
                    {unread > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full"
                        style={{ background: 'var(--hot)', border: '2px solid var(--s1)' }}
                      />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="flex items-center justify-between font-bold">
                      {c.partner.displayName}
                      <span className="text-xs font-normal" style={{ color: 'var(--mt)' }}>
                        {timeAgo(c.lastMessage?.createdAt ?? null)}
                      </span>
                    </p>
                    <p className="truncate text-sm" style={{ color: 'var(--dm)' }}>
                      {c.lastMessage?.content ?? 'Say hi 👋'}
                    </p>
                  </div>
                  {unread > 0 && (
                    <span
                      className="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold"
                      style={{ background: 'var(--hot)', color: '#fff' }}
                    >
                      {unread}
                    </span>
                  )}
                </button>
              );
            })}

            <p className="mt-8 text-center text-xs" style={{ color: 'var(--mt)' }}>
              Chats auto-delete after 7 days. Go live to make new connections.
            </p>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
