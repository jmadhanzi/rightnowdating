import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import Avatar from '@/components/Avatar';
import Button from '@/components/Button';
import CountdownTimer from '@/components/CountdownTimer';
import MatchSkeleton from '@/components/skeletons/MatchSkeleton';
import { useToast } from '@/hooks/useToast';
import { getIcebreaker, getMatch, type MatchData } from '@/services/api';
import { sparkDecline } from '@/services/socket';
import { VIBES } from '@/utils/vibes';

export default function MatchScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const { matchId } = useParams<{ matchId: string }>();

  const [match, setMatch] = useState<MatchData | null>(null);
  const [icebreaker, setIcebreaker] = useState<string | null>(null);
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    if (!matchId) return;
    getMatch(matchId)
      .then(setMatch)
      .catch(() => {
        toast.error('Could not load match');
        navigate('/map');
      });
    getIcebreaker(matchId)
      .then((r) => setIcebreaker(r.icebreaker))
      .catch(() => setIcebreaker(''));
  }, [matchId, navigate, toast]);

  // Progress bar drain.
  useEffect(() => {
    if (!match) return;
    const total = Date.parse(match.expiresAt) - Date.parse(match.createdAt);
    const tick = (): void => {
      const remaining = Date.parse(match.expiresAt) - Date.now();
      setProgress(Math.max(0, Math.min(1, remaining / total)));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [match]);

  if (!match) {
    return <MatchSkeleton />;
  }

  const urgent = progress * (Date.parse(match.expiresAt) - Date.parse(match.createdAt)) < 60_000;
  const accept = (): void => {
    // The spark was already accepted by the server when match:created was emitted;
    // calling sparkAccept again would be a no-op (or error) on the server.
    // Just navigate to the meetup screen.
    navigate(`/meetup/${match.matchId}`);
  };
  const decline = (): void => {
    if (match.sparkId) sparkDecline(match.sparkId);
    navigate('/map');
  };

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: 'var(--s0)', color: 'var(--tx)' }}
    >
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-5"
        style={{
          height: 'var(--hdr-h)',
          background: 'rgba(8,8,8,0.85)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <button
          type="button"
          aria-label="Back to map"
          onClick={() => navigate('/map')}
          className="text-xl focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s0)] rounded min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          ←
        </button>
        <span
          className="font-display text-xl font-extrabold italic tracking-tight"
          style={{ color: 'var(--hot)' }}
        >
          RIGHTNOW
        </span>
        <span
          className="rounded-full px-3 py-1 text-xs font-bold uppercase"
          style={{ background: 'rgba(255,92,0,0.12)', color: 'var(--hot)' }}
        >
          Match
        </span>
      </header>

      {/* Hero */}
      <div
        className="relative flex items-center justify-center"
        style={{
          height: '56vh',
          background: 'radial-gradient(circle at 50% 0%, rgba(255,92,0,0.28), transparent 60%)',
        }}
      >
        <span
          className="absolute left-5 top-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold"
          style={{ background: 'rgba(0,229,91,0.12)', color: 'var(--green)' }}
        >
          <span className="anim-dp h-2 w-2 rounded-full" style={{ background: 'var(--green)' }} />
          Active Now
        </span>
        <span
          className="absolute right-5 top-4 rounded-full px-3 py-1 text-xs font-bold"
          style={{ background: 'rgba(255,92,0,0.12)', color: 'var(--hot)' }}
        >
          {match.distanceMiles.toFixed(1)} mi
        </span>
        <div className="anim-bloom">
          <Avatar
            emoji={match.other.emoji}
            size="xl"
            trustScore={match.other.trustScore}
            showOnline
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-5 px-5 pb-32 pt-4">
        <div>
          <h1 className="font-display" style={{ fontSize: 32, fontWeight: 800 }}>
            {match.other.displayName}
            {match.other.age ? `, ${match.other.age}` : ''}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip color="var(--hot)" bg="rgba(255,92,0,0.12)">
              {VIBES[match.other.vibe].emoji} {VIBES[match.other.vibe].label}
            </Chip>
            {match.other.interests.slice(0, 2).map((tag) => (
              <Chip key={tag} color="var(--dm)" bg="var(--s2)">
                {tag}
              </Chip>
            ))}
            {match.other.verified && (
              <Chip color="var(--green)" bg="rgba(0,229,91,0.12)">
                ✓ Verified
              </Chip>
            )}
          </div>
        </div>

        {/* Countdown */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--dm)' }}>
            Match expires
          </p>
          <div className="mt-1 text-4xl">
            <CountdownTimer
              expiresAt={Date.parse(match.expiresAt)}
              variant="spark"
              onExpire={() => {
                toast.warning('Match expired');
                navigate('/map');
              }}
            />
          </div>
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--s3)' }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${progress * 100}%`,
                background: urgent ? 'var(--err)' : 'var(--hot)',
              }}
            />
          </div>
        </div>

        {/* AI icebreaker */}
        <div
          className="rounded-2xl p-4"
          style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
        >
          {icebreaker === null ? (
            <div className="space-y-2">
              <div
                className="h-3 w-1/3 animate-pulse rounded"
                style={{ background: 'var(--s3)' }}
              />
              <div
                className="h-3 w-full animate-pulse rounded"
                style={{ background: 'var(--s3)' }}
              />
              <div
                className="h-3 w-2/3 animate-pulse rounded"
                style={{ background: 'var(--s3)' }}
              />
            </div>
          ) : (
            <>
              <p
                className="text-xs font-bold uppercase tracking-wide"
                style={{ color: 'var(--hot)' }}
              >
                ✨ Icebreaker
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--tx)' }}>
                {icebreaker || 'Just say hi — you both showed up tonight.'}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Sticky actions */}
      <div
        className="sticky bottom-0 flex gap-3 px-5 py-4"
        style={{
          background: 'rgba(8,8,8,0.9)',
          backdropFilter: 'blur(16px)',
          borderTop: '1px solid var(--s3)',
        }}
      >
        <div className="flex-1">
          <Button fullWidth size="lg" icon={<span>⚡</span>} onClick={accept}>
            Accept &amp; Meet
          </Button>
        </div>
        <button
          type="button"
          onClick={decline}
          aria-label="Decline this match"
          className="flex items-center justify-center rounded-xl active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s0)]"
          style={{
            width: 58,
            height: 56,
            background: 'var(--s2)',
            border: '1px solid var(--s4)',
            color: 'var(--dm)',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function Chip({
  children,
  color,
  bg,
}: {
  children: React.ReactNode;
  color: string;
  bg: string;
}): React.JSX.Element {
  return (
    <span
      className="rounded-full px-3 py-1 text-xs font-semibold"
      style={{ background: bg, color }}
    >
      {children}
    </span>
  );
}
