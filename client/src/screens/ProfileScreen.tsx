import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import debounce from 'lodash.debounce';
import type { Vibe } from '@rightnow/shared';

import Button from '@/components/Button';
import BottomNav from '@/components/BottomNav';
import VibeChip from '@/components/VibeChip';
import ProfileSkeleton from '@/components/skeletons/ProfileSkeleton';
import { useToast } from '@/hooks/useToast';
import { getProfile, getReferralStats, updateProfile } from '@/services/api';
import { VIBES } from '@/utils/vibes';

const ALL_VIBES = Object.keys(VIBES) as Vibe[];
const EMOJIS = ['🧑', '👩', '👨', '😎', '🥳', '💃', '🕺', '🦊', '🦄', '🔥', '⚡', '🌙'];

interface ProfileData {
  display_name: string;
  age: number | null;
  avatar_emoji: string;
  bio: string | null;
  city: string;
  preferred_vibes: Vibe[] | null;
  trust_score: number;
  total_dates: number;
  average_rating: number;
  show_up_rate: number;
  verified_id: boolean;
  verified_phone: boolean;
  photo_matched: boolean;
  preferred_radius_miles: number | null;
  preferred_age_min: number | null;
  preferred_age_max: number | null;
}

export default function ProfileScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [bar, setBar] = useState(0);
  const [referralCount, setReferralCount] = useState(0);
  const [editPref, setEditPref] = useState<null | 'radius' | 'age' | 'city'>(null);
  const [prefValue, setPrefValue] = useState('');

  useEffect(() => {
    getProfile<ProfileData>()
      .then((p) => {
        setProfile(p);
        setTimeout(() => setBar(p.trust_score), 100);
      })
      .catch(() => toast.error('Could not load profile'));
    getReferralStats<{ totalReferred: number }>()
      .then((r) => setReferralCount(r.totalReferred))
      .catch(() => undefined);
  }, [toast]);

  const patch = (payload: Parameters<typeof updateProfile>[0]): void => {
    void updateProfile(payload).catch(() => toast.error('Could not save'));
  };

  const update = (partial: Partial<ProfileData>): void =>
    setProfile((p) => (p ? { ...p, ...partial } : p));

  // Debounced bio auto-save (1s after the user stops typing).
  const debouncedBioSave = useMemo(
    () =>
      debounce((value: string) => {
        void updateProfile({ bio: value }).catch(() => toast.error('Could not save'));
      }, 1000),
    [toast],
  );
  useEffect(() => () => debouncedBioSave.cancel(), [debouncedBioSave]);

  const onBioChange = (value: string): void => {
    update({ bio: value });
    debouncedBioSave(value);
  };

  const toggleVibe = (vibe: Vibe): void => {
    if (!profile) return;
    const current = profile.preferred_vibes ?? [];
    const next = current.includes(vibe) ? current.filter((v) => v !== vibe) : [...current, vibe];
    update({ preferred_vibes: next });
    patch({ vibes: next });
  };

  const savePref = (): void => {
    if (!editPref || !profile) return;
    if (editPref === 'radius') {
      const n = Number(prefValue);
      if (n > 0) {
        update({ preferred_radius_miles: n });
        patch({ preferred_radius_miles: n });
      }
    } else if (editPref === 'city') {
      update({ city: prefValue });
      patch({ city: prefValue });
    } else if (editPref === 'age') {
      const [min, max] = prefValue.split('-').map((s) => Number(s.trim()));
      if (min && max) {
        update({ preferred_age_min: min, preferred_age_max: max });
        patch({ preferred_age_min: min, preferred_age_max: max });
      }
    }
    setEditPref(null);
    toast.success('Saved');
  };

  if (!profile) {
    return <ProfileSkeleton />;
  }

  const verified = profile.verified_id || profile.trust_score >= 66;

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
        }}
      >
        <button type="button" onClick={() => navigate(-1)} className="text-xl">
          ←
        </button>
        <span
          className="font-display text-xl font-extrabold italic tracking-tight"
          style={{ color: 'var(--hot)' }}
        >
          RIGHTNOW
        </span>
        <button
          type="button"
          onClick={() => setIsEditing((e) => !e)}
          className="text-sm font-bold uppercase"
          style={{ color: 'var(--hot)' }}
        >
          {isEditing ? 'Save' : 'Edit'}
        </button>
      </header>

      {/* Hero */}
      <div
        className="relative flex items-center justify-center"
        style={{
          height: 260,
          background: 'radial-gradient(circle at 50% 50%, rgba(255,92,0,0.25), transparent 65%)',
        }}
      >
        <div className="relative">
          <button
            type="button"
            disabled={!isEditing}
            onClick={() => isEditing && setEmojiOpen(true)}
            className="flex items-center justify-center rounded-full"
            style={{
              width: 120,
              height: 120,
              background: 'var(--s3)',
              border: '2px solid var(--hot)',
              fontSize: 60,
            }}
          >
            {profile.avatar_emoji}
          </button>
          <span
            className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: 'var(--hot)', color: '#fff', border: '2px solid var(--s0)' }}
          >
            📷
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-6 px-5 pb-6">
        {/* Name + verified */}
        <div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <input
                value={profile.display_name}
                onChange={(e) => update({ display_name: e.target.value })}
                onBlur={() => patch({ displayName: profile.display_name })}
                maxLength={30}
                className="rounded-lg px-2 py-1 outline-none"
                style={{
                  background: 'var(--s2)',
                  border: '1px solid var(--s4)',
                  color: 'var(--tx)',
                  fontSize: 26,
                }}
              />
            ) : (
              <h1 className="font-display" style={{ fontSize: 30, fontWeight: 800 }}>
                {profile.display_name}
                {profile.age ? `, ${profile.age}` : ''}
              </h1>
            )}
            {verified && (
              <span
                className="rounded-full px-2 py-1 text-xs font-bold"
                style={{ background: 'rgba(0,229,91,0.12)', color: 'var(--green)' }}
              >
                ✓ Verified
              </span>
            )}
          </div>
          <p className="mt-1 text-sm" style={{ color: 'var(--dm)' }}>
            {profile.city} · <span style={{ color: 'var(--green)' }}>Active now</span>
          </p>
        </div>

        {/* Bio */}
        {isEditing ? (
          <div>
            <textarea
              value={profile.bio ?? ''}
              onChange={(e) => onBioChange(e.target.value.slice(0, 200))}
              placeholder="Tell people what tonight looks like…"
              rows={3}
              className="w-full rounded-xl p-3 outline-none"
              style={{ background: 'var(--s2)', border: '1px solid var(--s4)', color: 'var(--tx)' }}
            />
            <p className="mt-1 text-right text-xs" style={{ color: 'var(--mt)' }}>
              {200 - (profile.bio?.length ?? 0)} left
            </p>
          </div>
        ) : (
          profile.bio && (
            <p className="text-sm" style={{ color: 'var(--tx)' }}>
              {profile.bio}
            </p>
          )
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Dates" value={String(profile.total_dates)} color="var(--tx)" />
          <Stat
            label="Rating"
            value={profile.average_rating ? `${profile.average_rating.toFixed(1)}★` : '—'}
            color="var(--green)"
          />
          <Stat
            label="Show rate"
            value={`${Math.round(profile.show_up_rate * 100)}%`}
            color="var(--tx)"
          />
        </div>

        {/* Trust score */}
        <div
          className="rounded-2xl p-4"
          style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
        >
          <div className="flex items-center justify-between">
            <span
              className="text-sm font-bold uppercase tracking-wide"
              style={{ color: 'var(--dm)' }}
            >
              Trust Score
            </span>
            <span className="font-mono text-xl font-bold" style={{ color: 'var(--green)' }}>
              {profile.trust_score}
            </span>
          </div>
          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--s3)' }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-1000"
              style={{ width: `${bar}%`, background: 'var(--green)' }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <Check ok={profile.verified_id} label="ID Verified" />
            <Check ok={profile.verified_phone} label="Phone Verified" />
            <Check ok={profile.photo_matched} label="Photo Match" />
          </div>
        </div>

        {/* Vibes */}
        <div>
          <p
            className="mb-2 text-sm font-bold uppercase tracking-wide"
            style={{ color: 'var(--dm)' }}
          >
            Vibes
          </p>
          <div className="flex flex-wrap gap-2">
            {(isEditing ? ALL_VIBES : (profile.preferred_vibes ?? ['drinks'])).map((v) => (
              <VibeChip
                key={v}
                vibe={v}
                selected={(profile.preferred_vibes ?? []).includes(v)}
                onSelect={isEditing ? toggleVibe : undefined}
              />
            ))}
          </div>
        </div>

        {/* Preferences */}
        <div className="grid grid-cols-2 gap-3">
          <Pref
            label="Radius"
            value={`${profile.preferred_radius_miles ?? 2} mi`}
            editing={isEditing}
            onTap={() => {
              setPrefValue(String(profile.preferred_radius_miles ?? 2));
              setEditPref('radius');
            }}
          />
          <Pref
            label="Age Range"
            value={`${profile.preferred_age_min ?? 18}–${profile.preferred_age_max ?? 45}`}
            editing={isEditing}
            onTap={() => {
              setPrefValue(`${profile.preferred_age_min ?? 18}-${profile.preferred_age_max ?? 45}`);
              setEditPref('age');
            }}
          />
          <Pref label="Default Window" value="1h" editing={false} onTap={() => undefined} />
          <Pref
            label="City"
            value={profile.city}
            editing={isEditing}
            onTap={() => {
              setPrefValue(profile.city);
              setEditPref('city');
            }}
          />
        </div>

        {/* Referral shortcut */}
        <button
          type="button"
          onClick={() => navigate('/referral')}
          className="flex w-full items-center justify-between rounded-2xl p-4"
          style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
        >
          <span className="flex items-center gap-3">
            <span className="text-2xl">🎁</span>
            <span className="text-left">
              <span className="block font-bold" style={{ color: 'var(--tx)' }}>
                Invite friends, earn VIP
              </span>
              <span className="text-xs" style={{ color: 'var(--dm)' }}>
                {referralCount} invited
              </span>
            </span>
          </span>
          <span style={{ color: 'var(--hot)' }}>→</span>
        </button>

        <Button fullWidth size="lg" onClick={() => navigate('/live')}>
          GO LIVE NOW
        </Button>
      </div>

      {/* Emoji picker */}
      {emojiOpen && (
        <Sheet onClose={() => setEmojiOpen(false)}>
          <div className="grid grid-cols-6 gap-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  update({ avatar_emoji: e });
                  patch({ avatar_emoji: e });
                  setEmojiOpen(false);
                }}
                className="flex h-12 items-center justify-center rounded-lg text-2xl"
                style={{ background: 'var(--s3)' }}
              >
                {e}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {/* Preference editor */}
      {editPref && (
        <Sheet onClose={() => setEditPref(null)}>
          <p className="mb-2 font-bold capitalize" style={{ color: 'var(--tx)' }}>
            Edit {editPref === 'age' ? 'age range (min-max)' : editPref}
          </p>
          <input
            value={prefValue}
            onChange={(e) => setPrefValue(e.target.value)}
            className="mb-3 w-full rounded-xl px-4 py-3 outline-none"
            style={{ background: 'var(--s2)', border: '1px solid var(--s4)', color: 'var(--tx)' }}
          />
          <Button fullWidth onClick={savePref}>
            Save
          </Button>
        </Sheet>
      )}

      <BottomNav />
    </div>
  );
}

function Stat({
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

function Check({ ok, label }: { ok: boolean; label: string }): React.JSX.Element {
  return (
    <span style={{ color: ok ? 'var(--green)' : 'var(--mt)' }}>
      {ok ? '✓' : '○'} {label}
    </span>
  );
}

function Pref({
  label,
  value,
  editing,
  onTap,
}: {
  label: string;
  value: string;
  editing: boolean;
  onTap: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={!editing}
      onClick={onTap}
      className="rounded-2xl p-4 text-left"
      style={{
        background: 'var(--s1)',
        border: `1px solid ${editing ? 'var(--hot)' : 'var(--s3)'}`,
      }}
    >
      <p className="text-xs" style={{ color: 'var(--dm)' }}>
        {label}
      </p>
      <p className="mt-1 font-bold" style={{ color: 'var(--tx)' }}>
        {value}
      </p>
    </button>
  );
}

function Sheet({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="anim-su w-full rounded-t-3xl p-6"
        style={{ background: 'var(--s1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
