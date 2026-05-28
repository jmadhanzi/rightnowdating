import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import Button from '@/components/Button';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/useAuthStore';
import {
  getWingmanLink,
  getWingmanPreview,
  getWingmanTags,
  submitWingmanVouch,
  getMyVouches,
  deleteMyVouch,
  type WingmanVouch,
  type WingmanLinkResponse,
  type WingmanPreview,
} from '@/services/api';

// ---------------------------------------------------------------------------
// Top-level router: if ?vouch=<token> in URL → show public vouch flow
//                  otherwise → show the user's own wingman dashboard
// ---------------------------------------------------------------------------
export default function WingmanScreen(): React.JSX.Element {
  const [params] = useSearchParams();
  const token = params.get('vouch');

  if (token) return <PublicVouchFlow token={token} />;
  return <WingmanDashboard />;
}

// ===========================================================================
// PUBLIC VOUCH FLOW — what a friend sees when they click the link
// ===========================================================================
type VouchStep = 'preview' | 'tags' | 'endorsement' | 'done';

function PublicVouchFlow({ token }: { token: string }): React.JSX.Element {
  const toast = useToast();
  const [step, setStep] = useState<VouchStep>('preview');
  const [preview, setPreview] = useState<WingmanPreview | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [voucherName, setVoucherName] = useState('');
  const [endorsement, setEndorsement] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([getWingmanPreview(token), getWingmanTags()])
      .then(([prev, tagsRes]) => {
        setPreview(prev);
        setAvailableTags(tagsRes.tags);
      })
      .catch(() => toast.error('This wingman link has expired or is invalid.'))
      .finally(() => setLoading(false));
  }, [token, toast]);

  const toggleTag = (tag: string): void => {
    setSelectedTags((curr) => {
      if (curr.includes(tag)) return curr.filter((t) => t !== tag);
      if (curr.length >= 3) return curr; // max 3
      return [...curr, tag];
    });
  };

  const submit = useCallback(async (): Promise<void> => {
    if (!voucherName.trim()) {
      toast.error('Please enter your name.');
      return;
    }
    setSubmitting(true);
    try {
      await submitWingmanVouch({
        token,
        voucherName: voucherName.trim(),
        tags: selectedTags,
        endorsement: endorsement.trim() || undefined,
      });
      setStep('done');
    } catch {
      toast.error('Could not submit. The link may have expired.');
    } finally {
      setSubmitting(false);
    }
  }, [token, voucherName, selectedTags, endorsement, toast]);

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: 'var(--s0)', color: 'var(--dm)' }}
      >
        <span className="anim-dp">Loading…</span>
      </div>
    );
  }

  if (!preview) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center"
        style={{ background: 'var(--s0)', color: 'var(--tx)' }}
      >
        <span className="text-5xl">⚡</span>
        <p className="font-bold" style={{ color: 'var(--err)' }}>
          This link has expired or is invalid.
        </p>
        <p className="text-sm" style={{ color: 'var(--dm)' }}>
          Ask your friend to generate a new wingman link.
        </p>
      </div>
    );
  }

  // ── Step: Done ──
  if (step === 'done') {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-6 px-8 text-center"
        style={{ background: 'var(--s0)', color: 'var(--tx)' }}
      >
        <span className="anim-bloom text-7xl">✅</span>
        <h1 className="font-display italic" style={{ fontSize: 36, fontWeight: 800 }}>
          You vouched for{' '}
          <span style={{ color: 'var(--hot)' }}>{preview.avatarEmoji} {preview.displayName}</span>
        </h1>
        <p style={{ color: 'var(--dm)' }}>
          Your review will appear as a <strong style={{ color: 'var(--green)' }}>Verified Friend Review</strong>{' '}
          badge on their profile.
        </p>
        <div
          className="w-full max-w-xs rounded-2xl p-4 text-center"
          style={{ background: 'var(--s2)', border: '1px solid var(--s4)' }}
        >
          <p className="text-sm" style={{ color: 'var(--dm)' }}>
            Want to meet people tonight too?
          </p>
          <a
            href="https://rightnow.app"
            className="mt-2 block text-sm font-bold"
            style={{ color: 'var(--hot)' }}
          >
            Join RIGHTNOW →
          </a>
        </div>
      </div>
    );
  }

  // ── Step: Preview ──
  if (step === 'preview') {
    return (
      <div
        className="flex min-h-screen flex-col items-center px-6 pb-10 pt-16 text-center"
        style={{ background: 'var(--s0)', color: 'var(--tx)' }}
      >
        {/* Header */}
        <span
          className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase"
          style={{ background: 'rgba(255,92,0,0.12)', color: 'var(--hot)' }}
        >
          <span className="anim-dp h-2 w-2 rounded-full" style={{ background: 'var(--hot)' }} />
          Wingman Request
        </span>

        {/* Profile avatar */}
        <div
          className="flex h-28 w-28 items-center justify-center rounded-3xl text-6xl"
          style={{
            background: 'var(--s3)',
            border: '3px solid var(--hot)',
            boxShadow: '0 0 40px var(--glow)',
          }}
        >
          {preview.avatarEmoji}
        </div>

        <h1 className="mt-5 font-display italic" style={{ fontSize: 34, fontWeight: 800 }}>
          {preview.displayName}
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--dm)' }}>
          📍 {preview.city} · {preview.existingVouchCount > 0 ? `${preview.existingVouchCount} friend review${preview.existingVouchCount > 1 ? 's' : ''}` : 'No reviews yet'}
        </p>

        <p className="mt-6 max-w-xs text-base leading-relaxed" style={{ color: 'var(--tx)' }}>
          Your friend <strong>{preview.displayName}</strong> asked you to vouch for them on RIGHTNOW
          — a real-time dating app where people meet in under an hour.
        </p>

        <div
          className="mt-6 w-full max-w-sm rounded-2xl p-4 text-left text-sm"
          style={{ background: 'var(--s2)', border: '1px solid var(--s4)' }}
        >
          <p className="font-semibold" style={{ color: 'var(--hot)' }}>What you'll do:</p>
          <ul className="mt-2 space-y-1" style={{ color: 'var(--dm)' }}>
            <li>✓ Pick 3 personality tags that describe them</li>
            <li>✓ Write a short 1–2 line endorsement (optional)</li>
            <li>✓ Your review appears as a verified badge on their profile</li>
          </ul>
        </div>

        <div className="mt-8 w-full max-w-sm">
          <Button fullWidth size="lg" onClick={() => setStep('tags')}>
            Vouch for {preview.displayName} →
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: Tags ──
  if (step === 'tags') {
    return (
      <div
        className="min-h-screen px-6 pb-10 pt-16"
        style={{ background: 'var(--s0)', color: 'var(--tx)' }}
      >
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--hot)' }}>
          Step 1 of 2
        </p>
        <h1 className="mt-2 font-display italic" style={{ fontSize: 32, fontWeight: 800 }}>
          Pick 3 words that describe{' '}
          <span style={{ color: 'var(--hot)' }}>{preview.avatarEmoji} {preview.displayName}</span>
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--dm)' }}>
          {selectedTags.length}/3 selected
        </p>

        {/* Tag grid */}
        <div className="mt-6 flex flex-wrap gap-2">
          {availableTags.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className="rounded-full px-4 py-2 text-sm font-semibold capitalize active:scale-95"
                style={{
                  background: active ? 'var(--hot)' : 'var(--s2)',
                  border: `1px solid ${active ? 'var(--hot)' : 'var(--s4)'}`,
                  color: active ? '#fff' : 'var(--tx)',
                  transition: 'all 0.15s',
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>

        {/* Selected preview */}
        {selectedTags.length > 0 && (
          <div className="mt-6 flex gap-2 flex-wrap">
            {selectedTags.map((t) => (
              <span
                key={t}
                className="rounded-full px-3 py-1 text-xs font-bold capitalize"
                style={{ background: 'rgba(255,92,0,0.15)', color: 'var(--hot)' }}
              >
                ✓ {t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-8">
          <Button
            fullWidth
            size="lg"
            onClick={() => setStep('endorsement')}
            disabled={selectedTags.length !== 3}
          >
            Next — Add a note →
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: Endorsement + name ──
  return (
    <div
      className="min-h-screen px-6 pb-10 pt-16"
      style={{ background: 'var(--s0)', color: 'var(--tx)' }}
    >
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--hot)' }}>
        Step 2 of 2
      </p>
      <h1 className="mt-2 font-display italic" style={{ fontSize: 32, fontWeight: 800 }}>
        Your endorsement
      </h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--dm)' }}>
        Tell their matches what makes them worth meeting.
      </p>

      {/* Vouch name */}
      <div
        className="mt-6 flex items-center gap-2 rounded-xl px-4"
        style={{ background: 'var(--s2)', border: '1px solid var(--s4)', height: 54 }}
      >
        <span style={{ color: 'var(--dm)' }}>👤</span>
        <input
          value={voucherName}
          onChange={(e) => setVoucherName(e.target.value)}
          placeholder="Your first name (shown on the review)"
          maxLength={50}
          className="flex-1 bg-transparent outline-none"
          style={{ color: 'var(--tx)', fontSize: 16 }}
        />
      </div>

      {/* Endorsement text */}
      <textarea
        value={endorsement}
        onChange={(e) => setEndorsement(e.target.value)}
        placeholder={`Say something genuine about ${preview.displayName}. 1–2 lines is perfect. (Optional)`}
        maxLength={200}
        rows={4}
        className="mt-4 w-full resize-none rounded-xl px-4 py-3 outline-none"
        style={{
          background: 'var(--s2)',
          border: '1px solid var(--s4)',
          color: 'var(--tx)',
          fontSize: 15,
        }}
      />
      <p className="mt-1 text-right text-xs" style={{ color: 'var(--mt)' }}>
        {endorsement.length}/200
      </p>

      {/* Preview card */}
      <div
        className="mt-5 rounded-2xl p-4"
        style={{ background: 'var(--s2)', border: '1px solid var(--s4)' }}
      >
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--green)' }}>
          🛡️ Preview — Verified Friend Review
        </p>
        <div className="mt-3 flex items-start gap-3">
          <span className="text-2xl">{preview.avatarEmoji}</span>
          <div>
            <div className="flex flex-wrap gap-1 mt-1">
              {selectedTags.map((t) => (
                <span
                  key={t}
                  className="rounded-full px-2 py-0.5 text-xs font-semibold capitalize"
                  style={{ background: 'rgba(255,92,0,0.15)', color: 'var(--hot)' }}
                >
                  {t}
                </span>
              ))}
            </div>
            {endorsement && (
              <p className="mt-2 text-sm italic" style={{ color: 'var(--tx)' }}>
                "{endorsement.trim()}"
              </p>
            )}
            <p className="mt-1 text-xs" style={{ color: 'var(--dm)' }}>
              — {voucherName.trim() || 'Your name'} · Verified friend
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <Button fullWidth size="lg" loading={submitting} onClick={submit}>
          Submit My Vouch ✓
        </Button>
        <Button fullWidth variant="ghost" onClick={() => setStep('tags')}>
          ← Back
        </Button>
      </div>
    </div>
  );
}

// ===========================================================================
// WINGMAN DASHBOARD — the authenticated user's own wingman management view
// ===========================================================================
function WingmanDashboard(): React.JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const userId = useAuthStore((s) => s.user?.id);

  const [linkData, setLinkData] = useState<WingmanLinkResponse | null>(null);
  const [vouches, setVouches] = useState<WingmanVouch[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([getWingmanLink(), getMyVouches()])
      .then(([link, vouchRes]) => {
        setLinkData(link);
        setVouches(vouchRes.vouches);
      })
      .catch(() => toast.error('Could not load wingman data'))
      .finally(() => setLoading(false));
  }, [toast]);

  const copyLink = (): void => {
    if (!linkData) return;
    // Build the vouch URL pointing to /wingman?vouch=<token>
    const vouchUrl = `${linkData.link.replace('https://rightnow.app/vouch', window.location.origin + '/wingman')}?vouch=${linkData.token}`;
    navigator.clipboard?.writeText(vouchUrl).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareViaWhatsApp = (): void => {
    if (!linkData) return;
    const vouchUrl = `${window.location.origin}/wingman?vouch=${linkData.token}`;
    const text = encodeURIComponent(
      `Hey! Can you vouch for me on RIGHTNOW? Takes 30 seconds: ${vouchUrl}`,
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const shareViaMessages = (): void => {
    if (!linkData) return;
    const vouchUrl = `${window.location.origin}/wingman?vouch=${linkData.token}`;
    const text = encodeURIComponent(
      `Can you vouch for me on RIGHTNOW? Takes 30 seconds: ${vouchUrl}`,
    );
    window.open(`sms:?&body=${text}`, '_blank');
  };

  const removeVouch = async (id: string): Promise<void> => {
    try {
      await deleteMyVouch(id);
      setVouches((v) => v.filter((vouch) => vouch.id !== id));
      toast.success('Vouch removed');
    } catch {
      toast.error('Could not remove vouch');
    }
  };

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: 'var(--s0)', color: 'var(--dm)' }}
      >
        <span className="anim-dp">Loading…</span>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen pb-24"
      style={{ background: 'var(--s0)', color: 'var(--tx)' }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-30 flex items-center gap-3 px-4"
        style={{
          height: 'var(--hdr-h)',
          background: 'rgba(8,8,8,0.9)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--s3)',
        }}
      >
        <button type="button" onClick={() => navigate(-1)} className="text-xl">
          ←
        </button>
        <p className="flex-1 font-bold">Wingman</p>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-bold"
          style={{ background: 'rgba(0,229,91,0.15)', color: 'var(--green)' }}
        >
          {vouches.length} review{vouches.length !== 1 ? 's' : ''}
        </span>
      </header>

      <div className="space-y-6 px-5 pt-6">
        {/* Hero */}
        <div>
          <h1 className="font-display italic" style={{ fontSize: 34, fontWeight: 800 }}>
            Get your friends to<br />
            <span style={{ color: 'var(--hot)' }}>vouch for you</span>
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--dm)' }}>
            Profiles with friend reviews get <strong style={{ color: 'var(--green)' }}>3× more sparks.</strong>{' '}
            Share your link — it takes 30 seconds.
          </p>
        </div>

        {/* Share card */}
        <div
          className="rounded-2xl p-5"
          style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
        >
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--dm)' }}>
            Your Wingman Link
          </p>

          {/* Link display */}
          <div
            className="mt-3 flex items-center gap-2 overflow-hidden rounded-xl px-3"
            style={{ background: 'var(--s3)', border: '1px solid var(--s4)', height: 46 }}
          >
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs" style={{ color: 'var(--dm)' }}>
              {window.location.origin}/wingman?vouch={linkData?.token ?? '…'}
            </span>
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold active:scale-95"
              style={{
                background: copied ? 'rgba(0,229,91,0.2)' : 'var(--hot)',
                color: copied ? 'var(--green)' : '#fff',
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          {/* Share buttons */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={shareViaWhatsApp}
              aria-label="Share wingman link via WhatsApp"
              className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold active:scale-95"
              style={{ background: 'rgba(37,211,102,0.15)', color: '#25d366', border: '1px solid rgba(37,211,102,0.3)' }}
            >
              <span className="text-xl">💬</span>
              WhatsApp
            </button>
            <button
              type="button"
              onClick={shareViaMessages}
              aria-label="Share wingman link via iMessage"
              className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold active:scale-95"
              style={{ background: 'rgba(0,122,255,0.12)', color: '#007aff', border: '1px solid rgba(0,122,255,0.25)' }}
            >
              <span className="text-xl">📱</span>
              iMessage
            </button>
          </div>
        </div>

        {/* How it works */}
        <div
          className="rounded-2xl p-4"
          style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
        >
          <p className="mb-3 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--dm)' }}>
            How it works
          </p>
          {[
            { icon: '🔗', text: 'Share your link with a friend via WhatsApp or iMessage' },
            { icon: '🏷️', text: 'They pick 3 words that describe you + write a quick note' },
            { icon: '🛡️', text: 'A Verified Friend Review badge appears on your profile' },
          ].map((item, i) => (
            <div key={i} className="flex gap-3 py-2">
              <span className="text-xl">{item.icon}</span>
              <p className="text-sm" style={{ color: 'var(--tx)' }}>
                {item.text}
              </p>
            </div>
          ))}
        </div>

        {/* Vouches list */}
        {vouches.length > 0 && (
          <div>
            <p
              className="mb-3 text-xs font-bold uppercase tracking-wide"
              style={{ color: 'var(--dm)' }}
            >
              Your Friend Reviews ({vouches.length}/10)
            </p>
            <div className="space-y-3">
              {vouches.map((vouch) => (
                <VouchCard key={vouch.id} vouch={vouch} onDelete={() => void removeVouch(vouch.id)} />
              ))}
            </div>
          </div>
        )}

        {vouches.length === 0 && (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: 'var(--s1)', border: '1px dashed var(--s4)' }}
          >
            <span className="text-4xl">🤝</span>
            <p className="mt-3 font-semibold" style={{ color: 'var(--dm)' }}>
              No friend reviews yet
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--mt)' }}>
              Share your wingman link and be the most trusted profile in the city.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vouch card component
// ---------------------------------------------------------------------------
function VouchCard({
  vouch,
  onDelete,
}: {
  vouch: WingmanVouch;
  onDelete: () => void;
}): React.JSX.Element {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: 'rgba(0,229,91,0.15)', color: 'var(--green)' }}
            >
              🛡️ Verified Friend
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {vouch.tags.map((t) => (
              <span
                key={t}
                className="rounded-full px-2 py-0.5 text-xs font-semibold capitalize"
                style={{ background: 'rgba(255,92,0,0.12)', color: 'var(--hot)' }}
              >
                {t}
              </span>
            ))}
          </div>
          {vouch.endorsement && (
            <p className="mt-2 text-sm italic" style={{ color: 'var(--tx)' }}>
              "{vouch.endorsement}"
            </p>
          )}
          <p className="mt-1.5 text-xs" style={{ color: 'var(--dm)' }}>
            — {vouch.voucherName} ·{' '}
            {new Date(vouch.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirmDelete) onDelete();
            else setConfirmDelete(true);
          }}
          className="shrink-0 text-xs"
          style={{ color: confirmDelete ? 'var(--err)' : 'var(--mt)' }}
        >
          {confirmDelete ? 'Confirm?' : '✕'}
        </button>
      </div>
    </div>
  );
}
