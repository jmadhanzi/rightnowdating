import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import Button from '@/components/Button';
import BottomNav from '@/components/BottomNav';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/useAuthStore';
import {
  getMyDuo,
  searchUsersForDuo,
  inviteDuo,
  acceptDuo,
  endDuo,
  getNearbyOpenNights,
  createOpenNight,
  requestJoinOpenNight,
  type DuoProfile,
  type OpenNight,
} from '@/services/api';
import { VIBES } from '@/utils/vibes';
import type { Vibe } from '@rightnow/shared';

// ---------------------------------------------------------------------------
// Openness level config — the core psychological design
// ---------------------------------------------------------------------------
export const OPENNESS_OPTIONS = [
  {
    level: 'solo' as const,
    emoji: '🧍',
    label: 'Just me',
    sub: 'Classic 1-on-1 matching',
    color: 'var(--dm)',
    border: 'var(--s4)',
    bg: 'var(--s2)',
  },
  {
    level: 'duo_friendly' as const,
    emoji: '🤝',
    label: 'Duo-friendly',
    sub: 'Open to double dates',
    color: '#60a5fa',
    border: 'rgba(96,165,250,0.4)',
    bg: 'rgba(96,165,250,0.08)',
  },
  {
    level: 'group' as const,
    emoji: '👥',
    label: 'Group vibes',
    sub: 'Meet a whole crew',
    color: 'var(--green)',
    border: 'rgba(0,194,77,0.4)',
    bg: 'rgba(0,194,77,0.08)',
  },
  {
    level: 'open_night' as const,
    emoji: '🍸',
    label: 'Open Night',
    sub: 'Host a table, invite anyone',
    color: 'var(--gold)',
    border: 'rgba(217,119,6,0.4)',
    bg: 'rgba(217,119,6,0.08)',
  },
] as const;

export type OpennessLevel = (typeof OPENNESS_OPTIONS)[number]['level'];

const OPEN_NIGHT_VIBES: Vibe[] = ['drinks', 'food', 'late', 'coffee'];

// ---------------------------------------------------------------------------
// Main DuoScreen router
// ---------------------------------------------------------------------------
export default function DuoScreen(): React.JSX.Element {
  const [params] = useSearchParams();
  const tab = params.get('tab') ?? 'duo';

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: 'var(--s0)', color: 'var(--tx)', paddingBottom: 'var(--nav-h)' }}
    >
      {tab === 'nights' ? <OpenNightsTab /> : <DuoTab />}
      <BottomNav />
    </div>
  );
}

// ===========================================================================
// DUO TAB — invite a friend, manage active duo
// ===========================================================================
function DuoTab(): React.JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const userId = useAuthStore((s) => s.user?.id);

  const [duo, setDuo] = useState<DuoProfile | null | undefined>(undefined); // undefined = loading
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<{ id: string; displayName: string; age: number; avatarEmoji: string }>
  >([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getMyDuo()
      .then(setDuo)
      .catch(() => setDuo(null));
  }, []);

  const handleSearchChange = (q: string): void => {
    setSearchQuery(q);
    if (searchRef.current) clearTimeout(searchRef.current);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    searchRef.current = setTimeout(async () => {
      try {
        const res = await searchUsersForDuo(q);
        setSearchResults(res.users);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const handleInvite = async (partnerId: string): Promise<void> => {
    setInviting(partnerId);
    try {
      await inviteDuo(partnerId);
      toast.success('Duo invite sent! 🤝');
      setSearchQuery('');
      setSearchResults([]);
      const updated = await getMyDuo();
      setDuo(updated);
    } catch {
      toast.error('Could not send invite');
    } finally {
      setInviting(null);
    }
  };

  const handleAccept = async (duoId: string): Promise<void> => {
    setAcceptingId(duoId);
    try {
      await acceptDuo(duoId);
      toast.success("You're in a duo! Let's find a double date 🎉");
      const updated = await getMyDuo();
      setDuo(updated);
    } catch {
      toast.error('Could not accept duo');
    } finally {
      setAcceptingId(null);
    }
  };

  const handleEnd = async (): Promise<void> => {
    if (!duo) return;
    try {
      await endDuo(duo.duoId);
      setDuo(null);
      toast.info('Duo ended');
    } catch {
      toast.error('Could not end duo');
    }
  };

  return (
    <>
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-5"
        style={{
          height: 'var(--hdr-h)',
          background: 'rgba(8,8,8,0.9)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--s3)',
        }}
      >
        <button type="button" onClick={() => navigate(-1)} className="text-xl" aria-label="Back">←</button>
        <span className="font-display text-xl font-extrabold italic" style={{ color: 'var(--hot)' }}>
          Duo Mode
        </span>
        {/* Tab switch */}
        <button
          type="button"
          onClick={() => navigate('/duo?tab=nights')}
          className="rounded-full px-3 py-1 text-xs font-bold"
          style={{ background: 'rgba(217,119,6,0.15)', color: 'var(--gold)', border: '1px solid rgba(217,119,6,0.3)' }}
        >
          🍸 Open Nights
        </button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">

        {/* Hero */}
        <div>
          <h1
            className="font-display italic"
            style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1 }}
          >
            Go out as a team.<br />
            <span style={{ color: 'var(--hot)' }}>Meet as four.</span>
          </h1>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--dm)' }}>
            Bring a friend. Double dates are less nerve-wracking, more fun, and{' '}
            <strong style={{ color: 'var(--tx)' }}>3× more likely to turn into a second date.</strong>
          </p>
        </div>

        {/* Psychology cards */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: '🛡️', label: 'Less anxiety', body: 'Safety in numbers. Your friend has your back.' },
            { icon: '⚡', label: '3× matches', body: 'Duos get more sparks. People want the energy.' },
            { icon: '🎯', label: 'Real commitment', body: 'Two people committed means neither bails.' },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-2xl p-3 text-center"
              style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
            >
              <span className="text-2xl">{c.icon}</span>
              <p className="mt-1 text-xs font-bold" style={{ color: 'var(--tx)' }}>{c.label}</p>
              <p className="mt-1 text-[10px] leading-snug" style={{ color: 'var(--mt)' }}>{c.body}</p>
            </div>
          ))}
        </div>

        {/* Active / pending duo card */}
        {duo !== undefined && duo !== null && (
          <div
            className="rounded-2xl p-4"
            style={{
              background: duo.status === 'active' ? 'rgba(255,92,0,0.08)' : 'var(--s1)',
              border: `1px solid ${duo.status === 'active' ? 'var(--hot)' : 'var(--s3)'}`,
            }}
          >
            <div className="flex items-center gap-3">
              <span className="text-4xl">{duo.partner.avatarEmoji}</span>
              <div className="flex-1">
                <p className="font-bold" style={{ color: 'var(--tx)' }}>
                  {duo.partner.displayName}, {duo.partner.age}
                </p>
                <p className="text-xs" style={{ color: 'var(--dm)' }}>
                  Trust {duo.partner.trustScore} ·{' '}
                  {duo.status === 'active' ? (
                    <span style={{ color: 'var(--green)' }}>✓ Active duo</span>
                  ) : (
                    <span style={{ color: 'var(--gold)' }}>⏳ Invite pending</span>
                  )}
                </p>
              </div>
              {duo.status === 'active' ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => navigate('/live')}
                  >
                    Go live →
                  </Button>
                  <button
                    type="button"
                    aria-label="End duo partnership"
                    onClick={() => void handleEnd()}
                    className="text-xs focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:rounded"
                    style={{ color: 'var(--mt)' }}
                  >
                    End
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  aria-label="Cancel duo invite"
                  onClick={() => void handleEnd()}
                  className="text-xs focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:rounded"
                  style={{ color: 'var(--mt)' }}
                >
                  Cancel
                </button>
              )}
            </div>

            {duo.status === 'active' && (
              <div
                className="mt-3 rounded-xl px-3 py-2 text-center text-xs"
                style={{ background: 'rgba(0,194,77,0.08)', color: 'var(--green)' }}
              >
                🎉 You're a duo! Go live together or start an Open Night.
              </div>
            )}

            {duo.status === 'pending' && (
              <div
                className="mt-3 rounded-xl px-3 py-2 text-center text-xs"
                style={{ background: 'rgba(217,119,6,0.08)', color: 'var(--gold)' }}
              >
                Waiting for {duo.partner.displayName} to accept your invite…
              </div>
            )}
          </div>
        )}

        {/* Pending incoming invite — user is the partner_id */}
        {duo?.status === 'pending' && (
          <div
            className="rounded-2xl p-4"
            style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.3)' }}
          >
            <p className="mb-3 font-bold" style={{ color: '#60a5fa' }}>
              🤝 {duo.partner.displayName} invited you to a duo
            </p>
            <div className="flex gap-2">
              <Button
                fullWidth
                size="md"
                loading={acceptingId === duo.duoId}
                onClick={() => void handleAccept(duo.duoId)}
              >
                Accept — let's double date!
              </Button>
            </div>
          </div>
        )}

        {/* Find a duo partner */}
        {(!duo || duo.status === 'ended') && (
          <div>
            <p
              className="mb-3 text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--dm)' }}
            >
              Invite a friend
            </p>

            {/* Search input */}
            <div
              className="flex items-center gap-2 rounded-2xl px-4"
              style={{
                background: 'var(--s1)',
                border: '1px solid var(--s3)',
                height: 52,
              }}
            >
              <span style={{ color: 'var(--mt)' }}>🔍</span>
              <input
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search by name or phone number…"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--tx)' }}
              />
              {searching && <span className="text-xs" style={{ color: 'var(--mt)' }}>…</span>}
            </div>

            {/* Results */}
            {searchResults.length > 0 && (
              <div
                className="mt-2 overflow-hidden rounded-2xl"
                style={{ border: '1px solid var(--s3)' }}
              >
                {searchResults.map((user, i) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{
                      background: 'var(--s1)',
                      borderBottom: i < searchResults.length - 1 ? '1px solid var(--s3)' : 'none',
                    }}
                  >
                    <span className="text-2xl">{user.avatarEmoji}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-sm" style={{ color: 'var(--tx)' }}>
                        {user.displayName}, {user.age}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={inviting === user.id}
                      onClick={() => void handleInvite(user.id)}
                      className="rounded-full px-4 py-1.5 text-xs font-bold active:scale-95"
                      style={{
                        background: inviting === user.id ? 'var(--s3)' : 'var(--hot)',
                        color: '#fff',
                      }}
                    >
                      {inviting === user.id ? '…' : 'Invite'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
              <p className="mt-3 text-center text-sm" style={{ color: 'var(--mt)' }}>
                No users found. Share the RIGHTNOW link to get your friend on the app.
              </p>
            )}

            {/* Empty state CTA */}
            {searchQuery.length < 2 && (
              <div className="mt-4 space-y-3">
                <p className="text-xs leading-relaxed" style={{ color: 'var(--mt)' }}>
                  Don't have a friend on the app yet?{' '}
                  <button
                    type="button"
                    className="font-semibold"
                    style={{ color: 'var(--hot)' }}
                    onClick={() => {
                      const url = `${window.location.origin}/join`;
                      navigator.clipboard?.writeText(url).catch(() => undefined);
                      useToast().info('Link copied! Share it with your friend.');
                    }}
                  >
                    Copy your invite link →
                  </button>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Openness selector — educational */}
        <div>
          <p
            className="mb-3 text-xs font-bold uppercase tracking-widest"
            style={{ color: 'var(--dm)' }}
          >
            When you go live, pick your vibe
          </p>
          <div className="grid grid-cols-2 gap-3">
            {OPENNESS_OPTIONS.map((opt) => (
              <div
                key={opt.level}
                className="rounded-2xl p-4"
                style={{
                  background: opt.bg,
                  border: `1px solid ${opt.border}`,
                }}
              >
                <span className="text-3xl">{opt.emoji}</span>
                <p className="mt-2 font-bold text-sm" style={{ color: opt.color }}>
                  {opt.label}
                </p>
                <p className="mt-0.5 text-xs leading-snug" style={{ color: 'var(--dm)' }}>
                  {opt.sub}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs" style={{ color: 'var(--mt)' }}>
            You choose your openness level every time you tap GO LIVE — no commitment needed.
          </p>
        </div>

      </div>
    </>
  );
}

// ===========================================================================
// OPEN NIGHTS TAB — browse tables + create your own
// ===========================================================================
function OpenNightsTab(): React.JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();

  const [nights, setNights] = useState<OpenNight[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [duo, setDuo] = useState<DuoProfile | null>(null);

  useEffect(() => {
    getMyDuo()
      .then(setDuo)
      .catch(() => undefined);

    // Get location and load nearby nights
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await getNearbyOpenNights(pos.coords.latitude, pos.coords.longitude);
          setNights(res.nights);
        } catch {
          toast.error('Could not load open nights');
        } finally {
          setLoading(false);
        }
      },
      () => {
        setLoading(false);
        toast.warning('Enable location to see nearby open nights');
      },
      { timeout: 5000 },
    );
  }, [toast]);

  const handleJoin = async (night: OpenNight): Promise<void> => {
    setJoining(night.id);
    try {
      await requestJoinOpenNight({
        openNightId: night.id,
        duoId: duo?.status === 'active' ? duo.duoId : undefined,
      });
      toast.success(`Request sent to ${night.hostDisplayName}! 🙋`);
    } catch {
      toast.error('Could not send join request');
    } finally {
      setJoining(null);
    }
  };

  return (
    <>
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-5"
        style={{
          height: 'var(--hdr-h)',
          background: 'rgba(8,8,8,0.9)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--s3)',
        }}
      >
        <button type="button" onClick={() => navigate('/duo')} className="text-xl" aria-label="Back">←</button>
        <span className="font-display text-xl font-extrabold italic" style={{ color: 'var(--gold)' }}>
          🍸 Open Nights
        </span>
        <button
          type="button"
          aria-label="Host an Open Night at your table"
          onClick={() => setShowCreate(true)}
          className="rounded-full px-3 py-1 text-xs font-bold focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s0)]"
          style={{ background: 'var(--hot)', color: '#fff' }}
        >
          + Host
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">

        {/* Hero explanation */}
        <div
          className="rounded-2xl p-4"
          style={{ background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)' }}
        >
          <p className="font-bold" style={{ color: 'var(--gold)' }}>
            🍸 What's an Open Night?
          </p>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--dm)' }}>
            Someone's already out and has room at their table. No swiping, no cold approach —
            just tap "I'm in" and show up. Lowest pressure way to meet new people tonight.
          </p>
        </div>

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-32 rounded-2xl"
                style={{ background: 'var(--s1)', animation: 'pulse 2s infinite' }}
              />
            ))}
          </div>
        )}

        {!loading && nights.length === 0 && (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ background: 'var(--s1)', border: '1px dashed var(--s4)' }}
          >
            <span className="text-5xl">🌙</span>
            <p className="mt-4 font-bold" style={{ color: 'var(--tx)' }}>
              No open nights nearby yet
            </p>
            <p className="mt-2 text-sm" style={{ color: 'var(--dm)' }}>
              Be the first to host a table tonight. Others will come to you.
            </p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-4 rounded-full px-6 py-2 text-sm font-bold active:scale-95"
              style={{ background: 'var(--hot)', color: '#fff' }}
            >
              Host an Open Night
            </button>
          </div>
        )}

        {nights.map((night) => (
          <OpenNightCard
            key={night.id}
            night={night}
            myDuo={duo}
            joining={joining === night.id}
            onJoin={() => void handleJoin(night)}
          />
        ))}
      </div>

      {showCreate && (
        <CreateOpenNightSheet
          duo={duo}
          onClose={() => setShowCreate(false)}
          onCreate={(id) => {
            setShowCreate(false);
            toast.success('Your Open Night is live! 🍸');
            navigate('/duo?tab=nights');
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Open Night Card
// ---------------------------------------------------------------------------
function OpenNightCard({
  night,
  myDuo,
  joining,
  onJoin,
}: {
  night: OpenNight;
  myDuo: DuoProfile | null;
  joining: boolean;
  onJoin: () => void;
}): React.JSX.Element {
  const spotsBar = (night.spotsTaken / night.capacity) * 100;
  const vibe = VIBES[night.vibe as Vibe];

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <span className="text-3xl">{night.hostAvatarEmoji}</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm" style={{ color: 'var(--tx)' }}>
            {night.hostDisplayName}
            {night.partnerDisplayName && (
              <span style={{ color: 'var(--dm)' }}>
                {' '}&{' '}{night.partnerDisplayName}
              </span>
            )}
          </p>
          <p className="text-xs" style={{ color: 'var(--dm)' }}>
            📍 {night.venueName}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold"
          style={{ background: vibe ? 'rgba(255,92,0,0.12)' : 'var(--s3)', color: 'var(--hot)' }}
        >
          {vibe?.emoji} {vibe?.label ?? night.vibe}
        </span>
      </div>

      {/* Headline */}
      <div className="px-4 pb-3">
        <p className="text-base font-semibold leading-snug" style={{ color: 'var(--tx)' }}>
          "{night.headline}"
        </p>
      </div>

      {/* Spots bar */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs" style={{ color: 'var(--dm)' }}>
            {night.spotsLeft} spot{night.spotsLeft !== 1 ? 's' : ''} left
          </p>
          <p className="text-xs" style={{ color: 'var(--mt)' }}>
            {night.spotsTaken}/{night.capacity} filled
          </p>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--s3)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${spotsBar}%`,
              background: night.spotsLeft <= 1
                ? 'var(--err)'
                : 'linear-gradient(90deg, var(--hot), #ff8c00)',
            }}
          />
        </div>
      </div>

      {/* Join action */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderTop: '1px solid var(--s3)' }}
      >
        <div>
          {myDuo?.status === 'active' && (
            <p className="text-xs" style={{ color: '#60a5fa' }}>
              🤝 Joining as a duo with {myDuo.partner.displayName}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={joining || night.spotsLeft === 0}
          onClick={onJoin}
          className="rounded-full px-5 py-2 text-sm font-bold active:scale-95"
          style={{
            background: night.spotsLeft === 0 ? 'var(--s3)' : 'var(--hot)',
            color: night.spotsLeft === 0 ? 'var(--mt)' : '#fff',
            opacity: joining ? 0.7 : 1,
          }}
        >
          {joining ? '…' : night.spotsLeft === 0 ? 'Full' : "I'm in! 🙋"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Open Night bottom sheet
// ---------------------------------------------------------------------------
function CreateOpenNightSheet({
  duo,
  onClose,
  onCreate,
}: {
  duo: DuoProfile | null;
  onClose: () => void;
  onCreate: (id: string) => void;
}): React.JSX.Element {
  const toast = useToast();
  const [venueName, setVenueName] = useState('');
  const [headline, setHeadline] = useState('');
  const [vibe, setVibe] = useState<Vibe>('drinks');
  const [capacity, setCapacity] = useState(4);
  const [assDuo, setAsDuo] = useState(duo?.status === 'active');
  const [loading, setLoading] = useState(false);

  const headlineHints = [
    'We have 2 spots at our table, come have drinks 🍸',
    'Just ordered apps — room for 2 more at the bar',
    'First round is on us if you get here in 20min',
    'Low-key vibe at the rooftop, come join us',
    'We know the bouncer — join our table tonight',
  ];
  const [hintIdx] = useState(() => Math.floor(Math.random() * headlineHints.length));

  const submit = async (): Promise<void> => {
    if (!venueName.trim()) { toast.error('Enter your venue name'); return; }
    if (!headline.trim()) { toast.error('Add a headline to attract people'); return; }
    setLoading(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 }),
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {/* optional */ }

      const res = await createOpenNight({
        duoId: assDuo && duo?.status === 'active' ? duo.duoId : undefined,
        venueName: venueName.trim(),
        headline: headline.trim(),
        vibe,
        capacity,
        latitude: lat,
        longitude: lng,
        durationMinutes: 120,
      });
      onCreate(res.openNightId);
    } catch {
      toast.error('Could not create open night');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="anim-su w-full rounded-t-3xl px-5 pb-10 pt-5"
        style={{ background: 'var(--s1)', border: '1px solid var(--s3)', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-2xl font-extrabold italic" style={{ color: 'var(--gold)' }}>
            Host an Open Night
          </h2>
          <button type="button" aria-label="Close" onClick={onClose} className="text-xl focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:rounded" style={{ color: 'var(--mt)' }}>✕</button>
        </div>

        {/* Venue name */}
        <label className="mb-1 block text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--dm)' }}>
          Where are you?
        </label>
        <input
          value={venueName}
          onChange={(e) => setVenueName(e.target.value)}
          placeholder="Venue or bar name…"
          maxLength={120}
          className="mb-4 w-full rounded-xl px-4 py-3 text-sm outline-none"
          style={{ background: 'var(--s2)', border: '1px solid var(--s4)', color: 'var(--tx)' }}
        />

        {/* Headline */}
        <label className="mb-1 block text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--dm)' }}>
          Your invite headline
        </label>
        <textarea
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder={headlineHints[hintIdx]}
          maxLength={100}
          rows={2}
          className="mb-1 w-full resize-none rounded-xl px-4 py-3 text-sm outline-none"
          style={{ background: 'var(--s2)', border: '1px solid var(--s4)', color: 'var(--tx)' }}
        />
        <p className="mb-4 text-right text-xs" style={{ color: 'var(--mt)' }}>{headline.length}/100</p>

        {/* Vibe selector */}
        <label className="mb-2 block text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--dm)' }}>
          Tonight's vibe
        </label>
        <div className="mb-4 flex gap-2">
          {OPEN_NIGHT_VIBES.map((v) => {
            const active = vibe === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setVibe(v)}
                className="flex flex-1 flex-col items-center gap-1 rounded-xl py-2 active:scale-95"
                style={{
                  background: active ? 'rgba(255,92,0,0.15)' : 'var(--s2)',
                  border: `1px solid ${active ? 'var(--hot)' : 'var(--s4)'}`,
                }}
              >
                <span className="text-xl">{VIBES[v].emoji}</span>
                <span className="text-[10px] font-semibold" style={{ color: active ? 'var(--hot)' : 'var(--dm)' }}>
                  {VIBES[v].label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Capacity */}
        <label className="mb-2 block text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--dm)' }}>
          Table capacity (including you): {capacity}
        </label>
        <div className="mb-4 flex gap-2">
          {[2, 3, 4, 6, 8].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCapacity(n)}
              className="flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-bold active:scale-95"
              style={{
                background: capacity === n ? 'rgba(255,92,0,0.15)' : 'var(--s2)',
                border: `1px solid ${capacity === n ? 'var(--hot)' : 'var(--s4)'}`,
                color: capacity === n ? 'var(--hot)' : 'var(--dm)',
              }}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Duo option */}
        {duo?.status === 'active' && (
          <button
            type="button"
            onClick={() => setAsDuo((v) => !v)}
            className="mb-4 flex w-full items-center gap-3 rounded-xl px-4 py-3"
            style={{
              background: assDuo ? 'rgba(96,165,250,0.08)' : 'var(--s2)',
              border: `1px solid ${assDuo ? 'rgba(96,165,250,0.4)' : 'var(--s4)'}`,
            }}
          >
            <div
              className="flex h-5 w-5 items-center justify-center rounded"
              style={{
                background: assDuo ? '#60a5fa' : 'var(--s3)',
                border: `1px solid ${assDuo ? '#60a5fa' : 'var(--s4)'}`,
              }}
            >
              {assDuo && <span className="text-[10px] text-white font-bold">✓</span>}
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold" style={{ color: assDuo ? '#60a5fa' : 'var(--tx)' }}>
                Host as a duo with {duo.partner.displayName}
              </p>
              <p className="text-xs" style={{ color: 'var(--mt)' }}>
                Your duo appears on the open night card
              </p>
            </div>
          </button>
        )}

        <Button fullWidth size="lg" loading={loading} onClick={() => void submit()}>
          Post Open Night 🍸
        </Button>
      </div>
    </div>
  );
}
