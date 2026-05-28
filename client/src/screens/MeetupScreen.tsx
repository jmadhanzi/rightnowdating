import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import Button from '@/components/Button';
import CountdownTimer from '@/components/CountdownTimer';
import MatchSkeleton from '@/components/skeletons/MatchSkeleton';
import { useToast } from '@/hooks/useToast';
import { getIcebreaker, getMatch, getProfile, triggerSos, type MatchData } from '@/services/api';
import { confirmCheckin, getSocket } from '@/services/socket';

const CHECKIN_AUTO_CLOSE_MS = 2 * 60 * 1000;

export default function MeetupScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const { matchId } = useParams<{ matchId: string }>();

  const [match, setMatch] = useState<MatchData | null>(null);
  const [icebreaker, setIcebreaker] = useState<string | null>(null);
  const [myEmoji, setMyEmoji] = useState('🧑');
  const [sosOpen, setSosOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);

  useEffect(() => {
    if (!matchId) return;
    getMatch(matchId)
      .then(setMatch)
      .catch(() => {
        toast.error('Could not load meetup');
        navigate('/map');
      });
    getIcebreaker(matchId)
      .then((r) => setIcebreaker(r.icebreaker))
      .catch(() => setIcebreaker(''));
    getProfile<{ avatar_emoji: string }>()
      .then((p) => setMyEmoji(p.avatar_emoji ?? '🧑'))
      .catch(() => undefined);
  }, [matchId, navigate, toast]);

  // Safety check-in ping.
  useEffect(() => {
    const socket = getSocket();
    const onPing = (): void => setCheckinOpen(true);
    socket.on('date:checkin:ping', onPing);
    return () => {
      socket.off('date:checkin:ping', onPing);
    };
  }, []);

  // Auto-close the check-in modal after 2 minutes.
  useEffect(() => {
    if (!checkinOpen) return;
    const id = setTimeout(() => setCheckinOpen(false), CHECKIN_AUTO_CLOSE_MS);
    return () => clearTimeout(id);
  }, [checkinOpen]);

  const triggerSosNow = (): void => {
    if (!matchId) return;
    const fallback = match?.venue
      ? { lat: match.venue.lat, lng: match.venue.lng }
      : { lat: 25.7617, lng: -80.1918 };
    const send = (lat: number, lng: number): void => {
      triggerSos(matchId, lat, lng)
        .then((r) => toast.warning(`SOS sent — ${r.contacted.length} contact(s) notified`))
        .catch(() => toast.error('Could not send SOS'));
    };
    setSosOpen(false);
    setCheckinOpen(false);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => send(pos.coords.latitude, pos.coords.longitude),
        () => send(fallback.lat, fallback.lng),
        { timeout: 5000 },
      );
    } else {
      send(fallback.lat, fallback.lng);
    }
  };

  if (!match) {
    return <MatchSkeleton />;
  }

  const meetupAt = match.meetupTime ? Date.parse(match.meetupTime) : Date.now() + 22 * 60 * 1000;
  const name = match.other.displayName;

  const openMaps = (): void => {
    if (!match.venue) return;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${match.venue.lat},${match.venue.lng}`,
      '_blank',
    );
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
        <button type="button" onClick={() => navigate('/map')} className="text-xl">
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
          style={{ background: 'rgba(0,229,91,0.12)', color: 'var(--green)' }}
        >
          Date Set
        </span>
      </header>

      <div className="flex-1 space-y-5 px-5 pb-32 pt-5">
        {/* Celebration */}
        <div className="text-center">
          <h1
            className="anim-bloom font-display italic"
            style={{ fontSize: 52, fontWeight: 800, color: 'var(--hot)', lineHeight: 1 }}
          >
            It&apos;s a Date!
          </h1>
          <p
            className="mt-1 text-xs font-bold uppercase tracking-[0.25em]"
            style={{ color: 'var(--dm)' }}
          >
            Get ready to move
          </p>
        </div>

        {/* Countdown card */}
        <div
          className="relative overflow-hidden rounded-2xl p-5 text-center"
          style={{
            background: 'var(--s1)',
            border: '1px solid var(--hot)',
            boxShadow: '0 0 30px var(--glow)',
          }}
        >
          <div
            className="anim-scan absolute left-0 top-0 h-0.5 w-1/3"
            style={{ background: 'linear-gradient(90deg, transparent, var(--hot), transparent)' }}
          />
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--dm)' }}>
            Meet in
          </p>
          <div className="mt-1 text-5xl">
            <CountdownTimer expiresAt={meetupAt} variant="meetup" />
          </div>
          <p
            className="mt-2 inline-flex items-center gap-1 text-xs"
            style={{ color: 'var(--green)' }}
          >
            🔄 Shared countdown · both navigating
          </p>
        </div>

        {/* Avatars */}
        <div className="flex items-center justify-center gap-3">
          <AvatarCircle emoji={myEmoji} border="var(--hot)" />
          <span className="text-2xl">⚡</span>
          <AvatarCircle emoji={match.other.emoji} border="var(--green)" />
        </div>
        <div className="text-center">
          <p className="font-bold" style={{ color: 'var(--tx)' }}>
            You and {name}
          </p>
          <p className="text-xs" style={{ color: 'var(--mt)' }}>
            Confirmed just now
          </p>
        </div>

        {/* Venue card */}
        {match.venue && (
          <div
            className="rounded-2xl p-4"
            style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
          >
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--dm)' }}>
              Meetup spot
            </p>
            <p className="mt-1 font-display" style={{ fontSize: 22, fontWeight: 700 }}>
              {match.venue.name}
            </p>
            <p className="text-sm" style={{ color: 'var(--dm)' }}>
              {match.venue.address}
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--green)' }}>
              {match.distanceMiles.toFixed(1)} mi ·{' '}
              {match.venue.isSafeZone ? 'Safe Zone ✓' : 'Public venue'}
            </p>

            {/* Mini map preview */}
            <div
              className="relative mt-3 h-28 overflow-hidden rounded-xl"
              style={{
                background: 'var(--s0)',
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            >
              <span
                className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: 'var(--hot)', boxShadow: '0 0 12px var(--hot)' }}
              />
              <span
                className="anim-pring absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: 'var(--hot)' }}
              />
            </div>

            <div className="mt-3">
              <Button fullWidth onClick={openMaps} icon={<span>🧭</span>}>
                Open in Maps
              </Button>
            </div>
          </div>
        )}

        {/* Safety card */}
        <div
          className="flex gap-3 rounded-2xl p-4 text-sm"
          style={{
            background: 'rgba(0,229,91,0.1)',
            border: '1px solid var(--green)',
            color: 'var(--tx)',
          }}
        >
          <span className="text-xl">🛡️</span>
          <p>Safe Zone venue. Your trusted contact has been notified. SOS is accessible below.</p>
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

      {/* Sticky footer */}
      <div
        className="sticky bottom-0 flex gap-3 px-5 py-4"
        style={{
          background: 'rgba(8,8,8,0.9)',
          backdropFilter: 'blur(16px)',
          borderTop: '1px solid var(--s3)',
        }}
      >
        <div className="flex-1">
          <Button
            fullWidth
            size="lg"
            icon={<span>💬</span>}
            onClick={() => navigate(`/chat/${match.matchId}`)}
          >
            Message {name}
          </Button>
        </div>
        <button
          type="button"
          onClick={() => setSosOpen(true)}
          aria-label="Emergency SOS — tap to alert your trusted contacts"
          className="flex items-center justify-center rounded-xl font-bold active:scale-95 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--err)]"
          style={{ width: 56, height: 56, background: 'var(--err)', color: '#fff' }}
        >
          SOS
        </button>
      </div>

      {/* SOS confirm */}
      {sosOpen && (
        <Dialog onClose={() => setSosOpen(false)}>
          <p className="font-bold" style={{ color: 'var(--tx)', fontSize: 18 }}>
            Are you in danger?
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--dm)' }}>
            This will notify your trusted contacts with your location.
          </p>
          <div className="mt-4 space-y-2">
            <Button fullWidth variant="danger" size="lg" onClick={triggerSosNow}>
              Yes, I need help
            </Button>
            <Button fullWidth variant="ghost" onClick={() => setSosOpen(false)}>
              Cancel
            </Button>
          </div>
        </Dialog>
      )}

      {/* Safety check-in */}
      {checkinOpen && (
        <Dialog onClose={() => setCheckinOpen(false)}>
          <p className="font-bold" style={{ color: 'var(--tx)', fontSize: 18 }}>
            How is the date going?
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--dm)' }}>
            Tap to confirm you are safe.
          </p>
          <div className="mt-4 space-y-2">
            <Button
              fullWidth
              size="lg"
              onClick={() => {
                if (matchId) confirmCheckin(matchId);
                setCheckinOpen(false);
                toast.success("Glad you're safe!");
              }}
            >
              I&apos;m safe
            </Button>
            <Button fullWidth variant="danger" onClick={triggerSosNow}>
              Need help
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function AvatarCircle({ emoji, border }: { emoji: string; border: string }): React.JSX.Element {
  return (
    <span
      className="flex items-center justify-center rounded-full"
      style={{
        width: 64,
        height: 64,
        background: 'var(--s3)',
        border: `2px solid ${border}`,
        fontSize: 30,
      }}
    >
      {emoji}
    </span>
  );
}

function Dialog({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="anim-bloom w-full max-w-sm rounded-2xl p-6"
        style={{ background: 'var(--s1)', border: '1px solid var(--s4)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
