import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Button from '@/components/Button';
import BottomNav from '@/components/BottomNav';
import { useToast } from '@/hooks/useToast';
import {
  getWeeklyWrapped,
  getMonthlyWrapped,
  getMyStreak,
  getCityLeaderboard,
  type WeeklyWrapped,
  type MonthlyWrapped,
  type StreakInfo,
  type LeaderboardEntry,
} from '@/services/api';
import { useAuthStore } from '@/store/useAuthStore';
import { VIBES } from '@/utils/vibes';
import type { Vibe } from '@rightnow/shared';

// ---------------------------------------------------------------------------
// Vibe gradient map
// ---------------------------------------------------------------------------
const VIBE_COLORS: Record<string, string> = {
  drinks: '#ff5c00',
  food:   '#f59e0b',
  late:   '#8b5cf6',
  coffee: '#92400e',
  walk:   '#10b981',
  explore: '#3b82f6',
};

type Tab = 'weekly' | 'monthly' | 'streak' | 'leaderboard';

export default function WrappedScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const user = useAuthStore((s) => s.user);

  const [tab, setTab] = useState<Tab>('weekly');
  const [weekly, setWeekly] = useState<WeeklyWrapped | null>(null);
  const [monthly, setMonthly] = useState<MonthlyWrapped | null>(null);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getWeeklyWrapped().then(setWeekly),
      getMonthlyWrapped().then(setMonthly),
      getMyStreak().then(setStreak),
      getCityLeaderboard('Miami').then((r) => setLeaderboard(r.leaderboard)),
    ])
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const shareWeekly = (): void => {
    if (!weekly) return;
    navigator.clipboard?.writeText(weekly.shareText).catch(() => undefined);
    toast.success('Copied! Share it on your stories 📊');
  };

  const shareMonthly = (): void => {
    if (!monthly) return;
    navigator.clipboard?.writeText(monthly.shareText).catch(() => undefined);
    toast.success('Copied! Show the world your month 🔥');
  };

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: 'var(--s0)', color: 'var(--tx)', paddingBottom: 'var(--nav-h)' }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-5"
        style={{
          height: 'var(--hdr-h)',
          background: 'rgba(8,8,8,0.9)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--s3)',
        }}
      >
        <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="text-xl">←</button>
        <h1 className="font-display text-xl font-extrabold italic" style={{ color: 'var(--hot)' }}>
          ⚡ Your RIGHTNOW
        </h1>
        <div style={{ width: 32 }} />
      </header>

      {/* Tab bar */}
      <div
        className="flex border-b px-5 pt-3"
        role="tablist"
        aria-label="Stats view tabs"
        style={{ borderColor: 'var(--s3)', background: 'var(--s0)' }}
      >
        {([ ['weekly', 'This Week'], ['monthly', 'This Month'], ['streak', '🔥 Streak'], ['leaderboard', '🏆 City'] ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            type="button"
            aria-selected={tab === t}
            role="tab"
            onClick={() => setTab(t)}
            className="mr-4 pb-3 text-sm font-bold focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:rounded"
            style={{
              color: tab === t ? 'var(--hot)' : 'var(--mt)',
              borderBottom: tab === t ? '2px solid var(--hot)' : '2px solid transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 rounded-2xl" style={{ background: 'var(--s1)', animation: 'pulse 2s infinite' }} />
            ))}
          </div>
        ) : (
          <>
            {tab === 'weekly' && weekly && <WeeklyView data={weekly} onShare={shareWeekly} />}
            {tab === 'monthly' && monthly && <MonthlyView data={monthly} onShare={shareMonthly} />}
            {tab === 'streak' && streak && <StreakView streak={streak} />}
            {tab === 'leaderboard' && <LeaderboardView entries={leaderboard} myUserId={user?.id ?? ''} />}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

// ===========================================================================
// Weekly View — shareable card
// ===========================================================================
function WeeklyView({ data, onShare }: { data: WeeklyWrapped; onShare: () => void }): React.JSX.Element {
  const vibeColor = data.topVibe ? (VIBE_COLORS[data.topVibe] ?? 'var(--hot)') : 'var(--hot)';
  const vibeEmoji = data.topVibe ? (VIBES[data.topVibe as Vibe]?.emoji ?? '⚡') : '⚡';

  return (
    <div className="space-y-4">
      {/* Hero card — this is the shareable visual */}
      <div
        id="wrapped-card-weekly"
        className="relative overflow-hidden rounded-3xl p-6"
        style={{
          background: `radial-gradient(circle at 20% 20%, ${vibeColor}20, transparent 60%), linear-gradient(135deg, var(--s1) 0%, var(--s2) 100%)`,
          border: '1px solid var(--s3)',
        }}
      >
        {/* Background glow */}
        <div
          className="absolute -right-8 -top-8 h-40 w-40 rounded-full opacity-20 blur-3xl"
          style={{ background: vibeColor }}
          aria-hidden="true"
        />

        {/* Week label */}
        <span
          className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--dm)' }}
        >
          ⚡ RIGHTNOW · This week
        </span>

        {/* Headline */}
        <h2
          className="mt-4 font-display italic"
          style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2, color: 'var(--tx)' }}
        >
          {data.headline}
        </h2>

        {/* Top vibe */}
        {data.topVibe && (
          <p className="mt-1 text-sm" style={{ color: vibeColor }}>
            {vibeEmoji} Top vibe: {VIBES[data.topVibe as Vibe]?.label ?? data.topVibe}
          </p>
        )}

        {/* Stats grid */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            { val: data.nightsLive,    label: 'Nights live' },
            { val: data.matchesMade,   label: 'Matches' },
            { val: data.sparksSent,    label: 'Sparks sent' },
          ].map(({ val, label }) => (
            <div
              key={label}
              className="rounded-2xl py-3 text-center"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            >
              <p className="font-display text-3xl font-extrabold italic" style={{ color: vibeColor }}>
                {val}
              </p>
              <p className="mt-1 text-[10px]" style={{ color: 'var(--dm)' }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Secondary stats */}
        <div className="mt-3 flex items-center gap-3 text-xs" style={{ color: 'var(--dm)' }}>
          <span>{data.sparksReceived} sparks received</span>
          {data.datesConfirmed > 0 && <><span>·</span><span>📍 {data.datesConfirmed} date{data.datesConfirmed > 1 ? 's' : ''} confirmed</span></>}
          {data.avgMatchTimeMins && <><span>·</span><span>⏱ {Math.round(data.avgMatchTimeMins)}min avg to match</span></>}
        </div>

        {/* Watermark */}
        <p className="mt-4 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--mt)' }}>
          rightnow.app
        </p>
      </div>

      {/* Share button */}
      <button
        type="button"
        onClick={onShare}
        aria-label="Copy weekly recap to clipboard to share"
      className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s0)]"
      style={{ background: 'var(--s1)', border: '1px solid var(--s3)', color: 'var(--tx)' }}
    >
      <span aria-hidden="true">📤</span>
      Share to Stories
      </button>

      {/* Detailed breakdown */}
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--dm)' }}>
          Breakdown
        </p>
        {[
          { icon: '🌙', label: 'Nights live',        val: data.nightsLive },
          { icon: '⚡', label: 'Sparks sent',         val: data.sparksSent },
          { icon: '💫', label: 'Sparks received',     val: data.sparksReceived },
          { icon: '🎯', label: 'Matches made',         val: data.matchesMade },
          { icon: '📍', label: 'Dates confirmed',      val: data.datesConfirmed },
        ].map(({ icon, label, val }) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
          >
            <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--dm)' }}>
              <span className="text-base">{icon}</span>
              {label}
            </span>
            <span className="font-display text-xl font-extrabold italic" style={{ color: val > 0 ? 'var(--hot)' : 'var(--mt)' }}>
              {val}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// Monthly View — bigger, more narrative
// ===========================================================================
function MonthlyView({ data, onShare }: { data: MonthlyWrapped; onShare: () => void }): React.JSX.Element {
  const vibeColor = data.topVibe ? (VIBE_COLORS[data.topVibe] ?? 'var(--hot)') : 'var(--hot)';

  return (
    <div className="space-y-4">
      {/* Personality hero */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 text-center"
        style={{
          background: `radial-gradient(circle at 50% 30%, ${vibeColor}25, transparent 65%), var(--s1)`,
          border: '1px solid var(--s3)',
        }}
      >
        <div aria-hidden="true" className="absolute inset-0 opacity-5"
          style={{ background: 'repeating-linear-gradient(45deg, var(--hot) 0, var(--hot) 1px, transparent 0, transparent 50%)', backgroundSize: '12px 12px' }}
        />
        <span className="relative text-6xl">{data.personalityEmoji}</span>
        <h2
          className="relative mt-3 font-display italic"
          style={{ fontSize: 28, fontWeight: 800, color: 'var(--tx)' }}
        >
          {data.personalityType}
        </h2>
        <p className="relative mt-1 text-sm" style={{ color: 'var(--dm)' }}>
          Your personality this month
        </p>

        <div
          className="relative mt-4 rounded-2xl px-4 py-3"
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          <p className="font-display italic text-lg font-bold" style={{ color: vibeColor }}>
            {data.headline}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--mt)' }}>{data.subline}</p>
        </div>

        <p className="relative mt-4 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--mt)' }}>
          rightnow.app
        </p>
      </div>

      {/* Share */}
      <button
        type="button"
        onClick={onShare}
        aria-label="Copy monthly recap to clipboard to share"
      className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s0)]"
      style={{ background: 'var(--s1)', border: '1px solid var(--s3)', color: 'var(--tx)' }}
    >
      <span aria-hidden="true">📤</span>
      Share your month
      </button>

      {/* Badges */}
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--dm)' }}>
          Your badges
        </p>
        {data.badgeLines.map((badge) => (
          <div
            key={badge}
            className="mb-2 flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: 'rgba(255,92,0,0.06)', border: '1px solid rgba(255,92,0,0.2)' }}
          >
            <p className="text-sm" style={{ color: 'var(--hot)' }}>{badge}</p>
          </div>
        ))}
      </div>

      {/* Big stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: '🌙', label: 'Nights live',    val: data.nightsLive },
          { icon: '🎯', label: 'Matches',         val: data.matchesMade },
          { icon: '⚡', label: 'Sparks sent',     val: data.sparksSent },
          { icon: '🔥', label: 'Peak streak',     val: data.streakPeak },
          { icon: '📍', label: 'Dates confirmed', val: data.datesConfirmed },
          { icon: '💫', label: 'Sparks received', val: data.sparksReceived },
        ].map(({ icon, label, val }) => (
          <div
            key={label}
            className="rounded-2xl p-4 text-center"
            style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
          >
            <span className="text-2xl">{icon}</span>
            <p className="mt-1 font-display text-3xl font-extrabold italic" style={{ color: val > 0 ? 'var(--hot)' : 'var(--mt)' }}>
              {val}
            </p>
            <p className="mt-0.5 text-[10px]" style={{ color: 'var(--dm)' }}>{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// Streak View — gamification with loss aversion design
// ===========================================================================
function StreakView({ streak }: { streak: StreakInfo }): React.JSX.Element {
  const navigate = useNavigate();
  const pct = Math.min((streak.currentStreak / 10) * 100, 100);

  const milestones = [
    { nights: 3,  label: '3 nights',  icon: '🔥' },
    { nights: 5,  label: '5 nights',  icon: '🔥🔥' },
    { nights: 7,  label: 'Week',      icon: '⚡' },
    { nights: 10, label: '10 nights', icon: '👑' },
    { nights: 14, label: '2 weeks',   icon: '🏆' },
  ];

  return (
    <div className="space-y-5">
      {/* Hero streak display */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 text-center"
        style={{
          background: streak.currentStreak >= 3
            ? 'radial-gradient(circle at 50% 30%, rgba(255,92,0,0.2), transparent 65%), var(--s1)'
            : 'var(--s1)',
          border: `1px solid ${streak.currentStreak >= 3 ? 'var(--hot)' : 'var(--s3)'}`,
        }}
      >
        {streak.currentStreak >= 3 && (
          <div aria-hidden="true" className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(255,92,0,0.08), transparent 60%)' }}
          />
        )}
        <div className="relative">
          <span
            className="font-display italic"
            style={{ fontSize: 72, fontWeight: 800, color: streak.currentStreak >= 3 ? 'var(--hot)' : 'var(--dm)', lineHeight: 1 }}
          >
            {streak.currentStreak}
          </span>
          <p className="text-sm font-bold" style={{ color: 'var(--dm)' }}>
            {streak.currentStreak === 1 ? 'night streak' : 'night streak'}
          </p>

          {streak.currentStreak >= 3 && (
            <div
              className="mt-3 inline-block rounded-full px-4 py-1 text-xs font-bold"
              style={{ background: 'rgba(255,92,0,0.15)', color: 'var(--hot)', border: '1px solid rgba(255,92,0,0.3)' }}
            >
              🔥 You're on fire
            </div>
          )}

          {streak.currentStreak === 0 && (
            <div className="mt-3">
              <p className="text-sm" style={{ color: 'var(--mt)' }}>
                Go live tonight to start your streak
              </p>
              <Button size="md" onClick={() => navigate('/live')} className="mt-3">
                Go Live Now →
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar to next milestone */}
      {streak.currentStreak > 0 && streak.currentStreak < 14 && (
        <div>
          <div className="mb-2 flex items-center justify-between text-xs" style={{ color: 'var(--dm)' }}>
            <span>Progress to next milestone</span>
            <span style={{ color: 'var(--hot)' }}>
              {milestones.find((m) => m.nights > streak.currentStreak)?.icon}{' '}
              {milestones.find((m) => m.nights > streak.currentStreak)?.label}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--s3)' }}>
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--hot), #ff8c00)' }}
            />
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Best streak',   val: streak.longestStreak, icon: '🏆' },
          { label: 'Total nights',  val: streak.totalLiveNights, icon: '🌙' },
          { label: 'Status',        val: streak.isActive ? 'Active' : 'Dormant', icon: streak.isActive ? '✅' : '⏸' },
        ].map(({ label, val, icon }) => (
          <div
            key={label}
            className="rounded-2xl py-4 text-center"
            style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
          >
            <span className="text-xl">{icon}</span>
            <p className="mt-1 font-display text-xl font-extrabold italic" style={{ color: 'var(--hot)' }}>
              {val}
            </p>
            <p className="mt-0.5 text-[10px]" style={{ color: 'var(--dm)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Loss aversion message */}
      {streak.currentStreak >= 2 && !streak.isActive && (
        <div
          className="rounded-2xl p-4"
          style={{ background: 'rgba(255,68,85,0.08)', border: '1px solid rgba(255,68,85,0.3)' }}
        >
          <p className="font-bold text-sm" style={{ color: '#ff4455' }}>
            ⚠️ Your streak is at risk!
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--dm)' }}>
            Go live tonight to keep your {streak.currentStreak}-night streak. You'll lose it if you skip.
          </p>
          <button
            type="button"
            aria-label="Go live now to save your streak"
            onClick={() => navigate('/live')}
            className="mt-3 w-full rounded-xl py-2.5 text-sm font-bold active:scale-95 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hot)]"
            style={{ background: 'var(--hot)', color: '#fff' }}
          >
            Save my streak →
          </button>
        </div>
      )}

      {/* Milestone list */}
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--dm)' }}>
          Milestones
        </p>
        {milestones.map((m) => {
          const achieved = streak.longestStreak >= m.nights;
          return (
            <div
              key={m.nights}
              className="mb-2 flex items-center gap-3 rounded-xl px-4 py-3"
              style={{
                background: achieved ? 'rgba(255,92,0,0.06)' : 'var(--s1)',
                border: `1px solid ${achieved ? 'rgba(255,92,0,0.3)' : 'var(--s3)'}`,
                opacity: achieved ? 1 : 0.5,
              }}
            >
              <span className="text-2xl">{m.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: achieved ? 'var(--hot)' : 'var(--dm)' }}>
                  {m.nights}-night streak
                </p>
                <p className="text-xs" style={{ color: 'var(--mt)' }}>
                  {achieved ? '✓ Achieved' : `${m.nights - streak.currentStreak} more nights`}
                </p>
              </div>
              {achieved && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ background: 'rgba(0,194,77,0.15)', color: 'var(--green)' }}
                >
                  Done
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// Leaderboard View
// ===========================================================================
function LeaderboardView({ entries, myUserId }: { entries: LeaderboardEntry[]; myUserId: string }): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display italic text-2xl font-extrabold" style={{ color: 'var(--tx)' }}>
          Miami's top night owls 🌙
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--dm)' }}>
          This week's most active live users in your city.
        </p>
      </div>

      {entries.length === 0 && (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: 'var(--s1)', border: '1px dashed var(--s4)' }}
        >
          <span className="text-4xl">🏆</span>
          <p className="mt-3 font-semibold" style={{ color: 'var(--dm)' }}>
            Leaderboard resets weekly
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--mt)' }}>
            Be the first to go live and claim your spot.
          </p>
          <button
            type="button"
            aria-label="Go live now to appear on the leaderboard"
            onClick={() => navigate('/live')}
            className="mt-4 rounded-full px-6 py-2 text-sm font-bold active:scale-95 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--hot)]"
            style={{ background: 'var(--hot)', color: '#fff' }}
          >
            Go Live →
          </button>
        </div>
      )}

      {entries.map((entry, idx) => {
        const isMe = entry.userId === myUserId;
        const medals = ['🥇', '🥈', '🥉'];
        return (
          <div
            key={entry.userId}
            className="flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{
              background: isMe ? 'rgba(255,92,0,0.08)' : 'var(--s1)',
              border: `1px solid ${isMe ? 'var(--hot)' : 'var(--s3)'}`,
            }}
          >
            <span className="text-2xl flex-shrink-0" style={{ minWidth: 28 }}>
              {idx < 3 ? medals[idx] : `#${entry.rank}`}
            </span>
            <span className="text-3xl">{entry.avatarEmoji}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate" style={{ color: isMe ? 'var(--hot)' : 'var(--tx)' }}>
                {entry.displayName}{isMe ? ' (You)' : ''}
              </p>
              <p className="text-xs" style={{ color: 'var(--dm)' }}>
                {entry.nightsLive} nights · {entry.matchesMade} matches
              </p>
            </div>
            {idx === 0 && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: 'rgba(255,215,0,0.2)', color: 'var(--gold)' }}
              >
                👑 Top
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
