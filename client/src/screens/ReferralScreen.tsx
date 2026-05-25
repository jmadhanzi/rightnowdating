import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Button from '@/components/Button';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/useAuthStore';
import { getReferralStats } from '@/services/api';

interface ReferralStats {
  referralCode: string;
  referralLink: string;
  totalReferred: number;
  totalCompletedDates: number;
  currentTier: { name: string; reward: string; friendsNeeded: number; friendsAway: number };
  tiers: { tier: number; friends: number; reward: string; unlocked: boolean }[];
  cityLeaderboard: { rank: number; userId: string; displayName: string; count: number }[];
  userRank: number;
}

const TIER_ICONS = ['⚡', '⚡', '💜', '👑', '🏆'];
const SHARE = {
  tiktok:
    'POV: you had zero plans tonight. Opened RIGHTNOW, matched in 6 minutes, had drinks with a stranger who is now not a stranger. Link in bio.',
  instagram:
    'POV: you had zero plans tonight. Opened RIGHTNOW, matched in 6 minutes, had drinks with a stranger who is now not a stranger. Link in bio.',
  sms: 'Have you heard of RIGHTNOW? I met someone in 20 minutes last week. It is a dating app where you only go live when you are actually free right now. Try it: ',
  twitter:
    'Dating apps where you text for weeks then ghost = dead. Dating apps where you meet a stranger in under an hour = RIGHTNOW. This is the future: ',
};
const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;
const medal = (rank: number): string =>
  rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;

export default function ReferralScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const myId = useAuthStore((s) => s.user?.id);

  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [ringProgress, setRingProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  useEffect(() => {
    getReferralStats<ReferralStats>()
      .then((s) => {
        setStats(s);
        const target = s.currentTier.friendsNeeded || 10;
        setTimeout(() => setRingProgress(Math.min(1, s.totalCompletedDates / target)), 150);
      })
      .catch(() => toast.error('Could not load referrals'));
  }, [toast]);

  if (!stats) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: 'var(--s0)', color: 'var(--dm)' }}
      >
        Loading…
      </div>
    );
  }

  const target = stats.currentTier.friendsNeeded || 10;

  const copyLink = (): void => {
    navigator.clipboard?.writeText(stats.referralLink).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const share = (platform: keyof typeof SHARE): void => {
    const base = SHARE[platform];
    const message = platform === 'sms' || platform === 'twitter' ? base + stats.referralLink : base;
    if (navigator.share) {
      void navigator.share({ text: message, url: stats.referralLink }).catch(() => undefined);
    } else {
      setShareMsg(message);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--s0)', color: 'var(--tx)' }}>
      {/* Hero */}
      <div
        className="px-6 pb-6 pt-14"
        style={{ background: 'linear-gradient(180deg, rgba(255,92,0,0.25), transparent)' }}
      >
        <button type="button" onClick={() => navigate(-1)} className="mb-3 text-xl">
          ←
        </button>
        <h1
          className="font-display italic"
          style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.05 }}
        >
          Bring the party. Get <span style={{ color: 'var(--hot)' }}>rewarded.</span>
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--dm)' }}>
          Invite friends and unlock free boosts, VIP months, and more.
        </p>
      </div>

      <div className="space-y-6 px-6 pb-12">
        {/* Progress widget */}
        <div
          className="flex items-center gap-4 rounded-2xl p-4"
          style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
        >
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={RING_R} fill="none" stroke="var(--s3)" strokeWidth="10" />
            <circle
              cx="60"
              cy="60"
              r={RING_R}
              fill="none"
              stroke="var(--hot)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - ringProgress)}
              transform="rotate(-90 60 60)"
              style={{ transition: 'stroke-dashoffset 1.2s ease' }}
            />
            <text x="60" y="58" textAnchor="middle" fill="var(--tx)" fontSize="22" fontWeight="800">
              {stats.totalCompletedDates}
            </text>
            <text x="60" y="76" textAnchor="middle" fill="var(--dm)" fontSize="11">
              of {target}
            </text>
          </svg>
          <div className="flex-1">
            <p className="font-bold">{stats.totalCompletedDates} friends joined</p>
            <p className="text-sm" style={{ color: 'var(--dm)' }}>
              {stats.currentTier.friendsAway > 0
                ? `${stats.currentTier.friendsAway} away from ${stats.currentTier.reward}`
                : 'All rewards unlocked!'}
            </p>
            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
              style={{ background: 'var(--s3)' }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${ringProgress * 100}%`, background: 'var(--hot)' }}
              />
            </div>
          </div>
        </div>

        {/* Tiers */}
        <div className="space-y-2">
          {stats.tiers.map((t, i) => {
            const isCurrent = !t.unlocked && stats.tiers.slice(0, i).every((x) => x.unlocked);
            return (
              <div
                key={t.tier}
                className="flex items-center gap-3 rounded-xl p-3"
                style={{
                  background: 'var(--s1)',
                  border: `1px solid ${isCurrent ? 'var(--hot)' : 'var(--s3)'}`,
                  opacity: t.unlocked || isCurrent ? 1 : 0.55,
                }}
              >
                <span className="text-2xl">{TIER_ICONS[i]}</span>
                <div className="flex-1">
                  <p className="font-bold">{t.reward}</p>
                  <p className="text-xs" style={{ color: 'var(--dm)' }}>
                    {t.friends} friend{t.friends > 1 ? 's' : ''}
                  </p>
                </div>
                {t.unlocked ? (
                  <span style={{ color: 'var(--green)' }}>✓</span>
                ) : isCurrent ? (
                  <span
                    className="rounded-full px-2 py-1 text-xs font-bold"
                    style={{ background: 'rgba(255,92,0,0.12)', color: 'var(--hot)' }}
                  >
                    {t.friends - stats.totalCompletedDates} away
                  </span>
                ) : (
                  <span style={{ color: 'var(--mt)' }}>🔒</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Link box */}
        <div
          className="rounded-2xl p-4"
          style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
        >
          <div className="flex items-center gap-2">
            <code
              className="flex-1 truncate rounded-lg px-3 py-2 font-mono text-sm"
              style={{ background: 'var(--s2)', color: 'var(--tx)' }}
            >
              {stats.referralLink}
            </code>
            <Button size="sm" variant={copied ? 'gold' : 'primary'} onClick={copyLink}>
              {copied ? '✓ Copied' : 'Copy'}
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {(['tiktok', 'instagram', 'sms', 'twitter'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => share(p)}
                className="rounded-xl py-2 text-xs font-semibold capitalize"
                style={{
                  background: 'var(--s2)',
                  border: '1px solid var(--s4)',
                  color: 'var(--dm)',
                }}
              >
                {p === 'twitter' ? 'More' : p}
              </button>
            ))}
          </div>
        </div>

        {/* Leaderboard */}
        <div>
          <h2 className="mb-2 font-display text-xl font-bold">🏆 Miami Referral Leaders</h2>
          <div
            className="space-y-1 rounded-2xl p-2"
            style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
          >
            {stats.cityLeaderboard.length === 0 && (
              <p className="p-3 text-sm" style={{ color: 'var(--mt)' }}>
                Be the first to top the leaderboard.
              </p>
            )}
            {stats.cityLeaderboard.map((row) => {
              const isMe = row.userId === myId;
              return (
                <div
                  key={row.userId}
                  className="flex items-center gap-3 rounded-lg px-3 py-2"
                  style={{ background: isMe ? 'rgba(255,92,0,0.12)' : 'transparent' }}
                >
                  <span className="w-6 text-center font-bold">{medal(row.rank)}</span>
                  <span className="text-xl">🧑</span>
                  <span className="flex-1 font-semibold">{row.displayName}</span>
                  <span style={{ color: 'var(--hot)' }}>{row.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Share fallback */}
      {shareMsg && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShareMsg(null)}
        >
          <div
            className="anim-su w-full rounded-t-3xl p-6"
            style={{ background: 'var(--s1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-sm" style={{ color: 'var(--tx)' }}>
              {shareMsg}
            </p>
            <Button
              fullWidth
              onClick={() => {
                navigator.clipboard?.writeText(shareMsg).catch(() => undefined);
                toast.success('Copied to clipboard');
                setShareMsg(null);
              }}
            >
              Copy message
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
