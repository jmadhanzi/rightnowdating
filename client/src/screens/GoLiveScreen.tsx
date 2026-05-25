import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Vibe } from '@rightnow/shared';

import Button from '@/components/Button';
import BottomNav from '@/components/BottomNav';
import LiveBadge from '@/components/LiveBadge';
import { useToast } from '@/hooks/useToast';
import { useMapStore } from '@/store/useMapStore';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';
import { createLive, getProfile } from '@/services/api';
import { goOffline } from '@/services/socket';
import { VIBES } from '@/utils/vibes';
import { neighborhoodCoords } from '@/utils/geo';
import { formatMMSS } from '@/utils/time';

type WindowMinutes = 30 | 60 | 120;
const GO_LIVE_VIBES: Vibe[] = ['coffee', 'drinks', 'walk', 'food', 'late'];
const WINDOWS: { label: string; value: WindowMinutes }[] = [
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
  { label: '2h', value: 120 },
];

interface ProfileStats {
  trust_score: number;
  total_dates: number;
  average_rating: number;
}

const todayKey = (): string => `live.count.${new Date().toISOString().slice(0, 10)}`;
const getDailyCount = (): number => Number(localStorage.getItem(todayKey()) ?? '0');
const bumpDailyCount = (): void => localStorage.setItem(todayKey(), String(getDailyCount() + 1));

export default function GoLiveScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const mySession = useMapStore((s) => s.mySession);
  const setMySession = useMapStore((s) => s.setMySession);
  const storeCount = useMapStore((s) => s.cityCount);
  const plan = useSubscriptionStore((s) => s.plan);

  const [vibe, setVibe] = useState<Vibe>('drinks');
  const [windowMinutes, setWindowMinutes] = useState<WindowMinutes>(60);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [cityNum, setCityNum] = useState(storeCount || 47);
  const [pressed, setPressed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [liveLeft, setLiveLeft] = useState(0);
  const [neighborhoodMode, setNeighborhoodMode] = useState(false);
  const [neighborhood, setNeighborhood] = useState('');
  const [dailyCount, setDailyCount] = useState(getDailyCount);

  const locked = plan === 'free' && dailyCount >= 2 && !mySession;

  useEffect(() => {
    getProfile<ProfileStats>()
      .then(setStats)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setCityNum((n) => Math.max(0, n + Math.floor(Math.random() * 11) - 5));
    }, 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!mySession) return;
    const tick = (): void =>
      setLiveLeft(Math.max(0, Math.round((Date.parse(mySession.expiresAt) - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [mySession]);

  const activity =
    cityNum > 30
      ? { label: 'ACTIVE', color: 'var(--green)', dot: true }
      : cityNum >= 15
        ? { label: 'HEATING UP', color: 'var(--gold)', dot: false }
        : { label: 'QUIET', color: 'var(--mt)', dot: false };

  const doGoLive = useCallback(
    async (coords: { lat: number; lng: number }) => {
      setLoading(true);
      try {
        // Send raw GPS — the server applies fuzzing server-side so the
        // exact location is never stored. Applying applyFuzzyLocation here
        // would double-fuzz (idempotent, but semantically wrong).
        const res = await createLive({
          vibe,
          windowMinutes,
          latitude: coords.lat,
          longitude: coords.lng,
        });
        setMySession({ sessionId: res.sessionId, vibe, expiresAt: res.expiresAt });
        bumpDailyCount();
        setDailyCount(getDailyCount());
        navigate('/map');
      } catch (err) {
        const status = (err as { response?: { status?: number } }).response?.status;
        if (status === 403) {
          toast.warning('Upgrade for unlimited live sessions');
          navigate('/upgrade');
        } else {
          toast.error('Could not go live — try again');
        }
      } finally {
        setLoading(false);
      }
    },
    [vibe, windowMinutes, setMySession, navigate, toast],
  );

  const goLive = useCallback(() => {
    if (locked) {
      navigate('/upgrade');
      return;
    }
    if (!('geolocation' in navigator)) {
      setNeighborhoodMode(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => void doGoLive({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setNeighborhoodMode(true),
      { timeout: 6000 },
    );
  }, [locked, navigate, doGoLive]);

  const handlePress = (): void => {
    setPressed(true);
    setTimeout(() => {
      setPressed(false);
      goLive();
    }, 140);
  };

  const stopSession = (): void => {
    goOffline();
    setMySession(null);
    toast.success('Session ended');
  };

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: 'var(--s0)', color: 'var(--tx)', paddingBottom: 'var(--nav-h)' }}
    >
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-5"
        style={{
          height: 'var(--hdr-h)',
          background: 'rgba(8,8,8,0.85)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--s3)',
        }}
      >
        <button type="button" onClick={() => navigate('/profile')} className="text-xl">
          👤
        </button>
        <span
          className="font-display text-xl font-extrabold italic tracking-tight"
          style={{ color: 'var(--hot)' }}
        >
          RIGHTNOW
        </span>
        <div className="min-w-[64px] text-right">
          {mySession && <LiveBadge showTimer timeLeft={liveLeft} />}
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {/* City activity card */}
        <div
          className="flex items-center justify-between rounded-2xl p-4"
          style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">🌃</span>
            <div>
              <p className="text-sm" style={{ color: 'var(--dm)' }}>
                Miami
              </p>
              <p
                className="font-display text-4xl font-extrabold italic"
                style={{ color: 'var(--hot)' }}
              >
                {cityNum}
              </p>
            </div>
          </div>
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase"
            style={{ color: activity.color }}
          >
            {activity.dot && (
              <span
                className="anim-dp h-2 w-2 rounded-full"
                style={{ background: activity.color }}
              />
            )}
            {activity.label}
          </span>
        </div>

        {/* Vibe selector */}
        <div className="flex justify-between gap-2">
          {GO_LIVE_VIBES.map((v) => {
            const active = vibe === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setVibe(v)}
                className="flex flex-1 flex-col items-center gap-1 rounded-xl py-3 active:scale-95"
                style={{
                  background: active ? 'rgba(255,92,0,0.15)' : 'var(--s2)',
                  border: `1px solid ${active ? 'var(--hot)' : 'var(--s4)'}`,
                  color: active ? 'var(--hot)' : 'var(--dm)',
                }}
              >
                <span className="text-2xl">{VIBES[v].emoji}</span>
                <span className="text-[11px] font-semibold">{VIBES[v].label}</span>
              </button>
            );
          })}
        </div>

        {/* GO LIVE button */}
        <div className="flex flex-col items-center py-2">
          <div
            className="relative flex items-center justify-center"
            style={{ width: 190, height: 190 }}
          >
            {!locked &&
              [0, 0.7, 1.4].map((delay) => (
                <span
                  key={delay}
                  className="anim-pring absolute rounded-full"
                  style={{
                    width: 150,
                    height: 150,
                    background: 'var(--hot)',
                    opacity: 0.18,
                    animationDelay: `${delay}s`,
                  }}
                />
              ))}
            <button
              type="button"
              onClick={locked ? () => navigate('/upgrade') : handlePress}
              disabled={loading}
              className={locked ? '' : 'anim-gp'}
              style={{
                position: 'relative',
                width: 142,
                height: 142,
                borderRadius: '9999px',
                background: locked ? 'var(--s3)' : 'linear-gradient(135deg, #ff5c00, #ff8c00)',
                color: locked ? 'var(--dm)' : '#fff',
                transform: pressed ? 'scale(0.88)' : 'scale(1)',
                transition: 'transform 140ms ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {locked ? (
                <>
                  <span className="text-3xl">🔒</span>
                  <span className="mt-1 px-3 text-center text-[11px] font-bold uppercase">
                    Upgrade for unlimited
                  </span>
                </>
              ) : mySession ? (
                <>
                  <span className="font-display text-2xl font-extrabold italic">LIVE</span>
                  <span className="text-sm tabular-nums">{formatMMSS(liveLeft)}</span>
                </>
              ) : (
                <>
                  <span className="font-display text-[38px] font-extrabold italic leading-none">
                    GO
                  </span>
                  <span className="text-sm font-bold uppercase tracking-widest">Live</span>
                </>
              )}
            </button>
          </div>

          {mySession && (
            <div className="mt-4 w-full max-w-xs">
              <Button fullWidth variant="danger" onClick={stopSession}>
                Stop session
              </Button>
            </div>
          )}
        </div>

        {/* Time window selector */}
        {!mySession && (
          <div
            className="mx-auto flex max-w-xs rounded-full p-1"
            style={{ background: 'var(--s2)', border: '1px solid var(--s4)' }}
          >
            {WINDOWS.map((w) => {
              const active = windowMinutes === w.value;
              return (
                <button
                  key={w.value}
                  type="button"
                  onClick={() => setWindowMinutes(w.value)}
                  className="flex-1 rounded-full py-2 text-sm font-bold"
                  style={{
                    background: active
                      ? 'linear-gradient(135deg, var(--hot), #ff8c00)'
                      : 'transparent',
                    color: active ? '#fff' : 'var(--dm)',
                  }}
                >
                  {w.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Trust Score"
            value={String(stats?.trust_score ?? '—')}
            color="var(--hot)"
          />
          <StatCard label="Total dates" value={String(stats?.total_dates ?? 0)} color="var(--tx)" />
          <StatCard
            label="Avg rating"
            value={stats?.average_rating ? `${stats.average_rating.toFixed(1)}★` : '—'}
            color="var(--green)"
          />
        </div>
      </div>

      {/* Neighborhood fallback */}
      {neighborhoodMode && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setNeighborhoodMode(false)}
        >
          <div
            className="anim-su w-full rounded-t-3xl p-6"
            style={{ background: 'var(--s1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 font-bold" style={{ color: 'var(--tx)' }}>
              Which neighborhood are you in?
            </p>
            <p className="mb-3 text-xs" style={{ color: 'var(--dm)' }}>
              We&apos;ll use an approximate location.
            </p>
            <input
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="e.g. Wynwood"
              className="mb-3 w-full rounded-xl px-4 py-3 outline-none"
              style={{ background: 'var(--s2)', border: '1px solid var(--s4)', color: 'var(--tx)' }}
            />
            <Button
              fullWidth
              size="lg"
              loading={loading}
              onClick={() => {
                setNeighborhoodMode(false);
                void doGoLive(neighborhoodCoords(neighborhood || 'Miami'));
              }}
            >
              Go Live here
            </Button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}): React.JSX.Element {
  return (
    <div
      className="rounded-2xl py-4 text-center"
      style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
    >
      <p className="font-display text-2xl font-extrabold" style={{ color }}>
        {value}
      </p>
      <p className="mt-1 text-xs" style={{ color: 'var(--dm)' }}>
        {label}
      </p>
    </div>
  );
}
