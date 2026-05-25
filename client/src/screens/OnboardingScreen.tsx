import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Vibe } from '@rightnow/shared';

import Button from '@/components/Button';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/useAuthStore';
import { requestOtp as apiRequestOtp, updateProfile } from '@/services/api';
import { requestAndSubscribe } from '@/services/pushNotifications';
import { VIBES } from '@/utils/vibes';

const TOTAL_STEPS = 5;
const TARGET_COUNT = 47;
const ONBOARD_VIBES: Vibe[] = ['coffee', 'drinks', 'walk', 'food', 'explore', 'late'];

const EMOJIS = [
  '🧑',
  '👩',
  '👨',
  '🧔',
  '👱',
  '👩‍🦰',
  '🧑‍🦱',
  '👩‍🦱',
  '🧑‍🦳',
  '👴',
  '👵',
  '🦸',
  '🦹',
  '🧙',
  '🧚',
  '🧛',
  '🤠',
  '😎',
  '🥳',
  '😏',
  '😇',
  '🤓',
  '🦊',
  '🐯',
  '🦁',
  '🐺',
  '🦄',
  '🐲',
  '🌊',
  '🔥',
  '⚡',
  '🌙',
  '⭐',
  '🎸',
  '🎧',
  '🛹',
];

/** 11 fixed-random pulse pins for the city map backdrop. */
function useCityPins(): { top: number; left: number; delay: number }[] {
  return useMemo(
    () =>
      Array.from({ length: 11 }, (_, i) => ({
        top: 8 + ((i * 37 + 11) % 78),
        left: 6 + ((i * 53 + 19) % 86),
        delay: (i % 5) * 0.4,
      })),
    [],
  );
}

export default function OnboardingScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const login = useAuthStore((s) => s.login);
  const cityPins = useCityPins();

  const [step, setStep] = useState(1);
  const [leaving, setLeaving] = useState(false);

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [selectedVibe, setSelectedVibe] = useState<Vibe>('drinks');
  const [displayName, setDisplayName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('🧑');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [count, setCount] = useState(0);
  const [liveNow, setLiveNow] = useState(TARGET_COUNT);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [shakePhone, setShakePhone] = useState(false);
  const [shakeOtp, setShakeOtp] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const profileSaved = useRef(false);

  const e164 = `+1${phone.replace(/\D/g, '')}`;
  const phoneValid = phone.replace(/\D/g, '').length === 10;

  const advance = useCallback((to: number) => {
    setError('');
    setLeaving(true);
    setTimeout(() => {
      setStep(to);
      setLeaving(false);
    }, 380);
  }, []);

  const triggerShake = (setter: (v: boolean) => void): void => {
    setter(true);
    setTimeout(() => setter(false), 420);
  };

  // Step 1: count up 0 -> 47 over 1.2s on mount.
  useEffect(() => {
    const ticks = 30;
    let current = 0;
    const id = setInterval(() => {
      current += 1;
      setCount(Math.round((current / ticks) * TARGET_COUNT));
      if (current >= ticks) clearInterval(id);
    }, 1200 / ticks);
    return () => clearInterval(id);
  }, []);

  // Resend countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  // Step 5: fluctuating "live now" + one-time profile save.
  useEffect(() => {
    if (step !== 5) return;
    // Only save when displayName was filled in — returning users skip step 3
    // and land here with an empty displayName, so we must not overwrite their
    // existing profile with blank values.
    if (!profileSaved.current && displayName.trim().length > 0) {
      profileSaved.current = true;
      const trimmed = displayName.trim();
      const ageMatch = trimmed.match(/(\d{1,2})\s*$/);
      const age = ageMatch ? Number(ageMatch[1]) : undefined;
      const name = (ageMatch ? trimmed.replace(/(\d{1,2})\s*$/, '').trim() : trimmed) || 'New User';
      updateProfile({
        displayName: name.slice(0, 30),
        ...(age && age >= 18 && age <= 99 ? { age } : {}),
        avatar_emoji: selectedEmoji,
        vibe: selectedVibe,
      }).catch(() => toast.error('Could not save your profile'));
    }
    const id = setInterval(() => {
      setLiveNow(TARGET_COUNT + Math.floor(Math.random() * 7) - 3);
    }, 4000);
    return () => clearInterval(id);
  }, [step, displayName, selectedEmoji, selectedVibe, toast]);

  const requestOtp = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      await apiRequestOtp(e164);
      setOtpSent(true);
      setResendIn(30);
      setError('');
      return true;
    } catch {
      setError('Could not send a code to that number.');
      triggerShake(setShakePhone);
      toast.error('Network error — please try again');
      return false;
    } finally {
      setLoading(false);
    }
  }, [e164, toast]);

  const handleImIn = async (): Promise<void> => {
    if (!phoneValid) {
      setError('Enter a valid 10-digit phone number.');
      triggerShake(setShakePhone);
      return;
    }
    if (await requestOtp()) advance(2);
  };

  const verify = useCallback(
    async (code: string): Promise<void> => {
      setLoading(true);
      try {
        const res = await login(e164, code);
        setError('');
        advance(res.isNewUser ? 3 : 5);
      } catch (err) {
        const status = (err as { response?: { status?: number } }).response?.status;
        if (status === 401) {
          setError('Incorrect code. Try again.');
          triggerShake(setShakeOtp);
          setOtp('');
          setResendIn(30);
          otpRefs.current[0]?.focus();
        } else {
          toast.error('Network error — please try again');
        }
      } finally {
        setLoading(false);
      }
    },
    [e164, login, advance, toast],
  );

  const handleOtpChange = (index: number, value: string): void => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const chars = otp.split('');
    chars[index] = digit ?? '';
    const joined = chars.join('').slice(0, 6);
    setOtp(joined);
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
    if (joined.length === 6) void verify(joined);
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  const handleStep2Primary = async (): Promise<void> => {
    if (!otpSent) {
      await requestOtp();
      return;
    }
    if (otp.length === 6) await verify(otp);
    else {
      setError('Enter the 6-digit code.');
      triggerShake(setShakeOtp);
    }
  };

  const enableNotifications = async (): Promise<void> => {
    const { subscribed } = await requestAndSubscribe();
    if (!subscribed) toast.info('Notifications can be enabled later in settings');
    advance(5);
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: 'var(--s0)', color: 'var(--tx)' }}
    >
      <ProgressDots step={step} />

      <div className={leaving ? 'step-out' : 'step-in'} key={step}>
        {step === 1 && (
          <Step1
            cityPins={cityPins}
            count={count}
            phone={phone}
            setPhone={setPhone}
            shakePhone={shakePhone}
            error={error}
            loading={loading}
            onImIn={handleImIn}
            onHow={() => advance(2)}
          />
        )}
        {step === 2 && (
          <Step2
            otpSent={otpSent}
            otp={otp}
            otpRefs={otpRefs}
            shakeOtp={shakeOtp}
            error={error}
            loading={loading}
            resendIn={resendIn}
            onOtpChange={handleOtpChange}
            onOtpKeyDown={handleOtpKeyDown}
            onResend={() => void requestOtp()}
            onPrimary={handleStep2Primary}
          />
        )}
        {step === 3 && (
          <Step3
            selectedEmoji={selectedEmoji}
            setSelectedEmoji={setSelectedEmoji}
            emojiOpen={emojiOpen}
            setEmojiOpen={setEmojiOpen}
            displayName={displayName}
            setDisplayName={setDisplayName}
            selectedVibe={selectedVibe}
            setSelectedVibe={setSelectedVibe}
            onNext={() => advance(4)}
          />
        )}
        {step === 4 && (
          <Step4 loading={loading} onEnable={enableNotifications} onSkip={() => advance(5)} />
        )}
        {step === 5 && <Step5 liveNow={liveNow} onGoLive={() => navigate('/live')} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ProgressDots({ step }: { step: number }): React.JSX.Element {
  return (
    <div className="absolute left-0 right-0 top-5 z-30 flex items-center justify-center gap-2">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => {
        const active = i + 1 === step;
        return (
          <span
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: active ? 22 : 6,
              height: 6,
              background: active ? 'var(--hot)' : 'var(--s4)',
            }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — City Is Alive
// ---------------------------------------------------------------------------
interface Step1Props {
  cityPins: { top: number; left: number; delay: number }[];
  count: number;
  phone: string;
  setPhone: (v: string) => void;
  shakePhone: boolean;
  error: string;
  loading: boolean;
  onImIn: () => void;
  onHow: () => void;
}

function Step1(props: Step1Props): React.JSX.Element {
  const { cityPins, count, phone, setPhone, shakePhone, error, loading, onImIn, onHow } = props;
  return (
    <div
      className="relative flex min-h-screen flex-col px-6 pb-8 pt-16"
      style={{
        background:
          'radial-gradient(circle at 50% 0%, rgba(255,92,0,0.25), transparent 55%), var(--s0)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />
      {cityPins.map((p, i) => (
        <span
          key={i}
          className="anim-pring pointer-events-none absolute z-0 h-3 w-3 rounded-full"
          style={{
            top: `${p.top}%`,
            left: `${p.left}%`,
            background: 'var(--hot)',
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}

      <div className="relative z-10 flex flex-1 flex-col">
        <div className="flex justify-center">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide"
            style={{ background: 'rgba(0,229,91,0.12)', color: 'var(--green)' }}
          >
            <span className="anim-dp h-2 w-2 rounded-full" style={{ background: 'var(--green)' }} />
            Miami is live right now
          </span>
        </div>

        <div className="mt-12 flex flex-1 flex-col items-center text-center">
          <p
            className="text-xs font-bold uppercase tracking-[0.25em]"
            style={{ color: 'var(--dm)' }}
          >
            People available near you
          </p>
          <span
            className="font-display italic"
            style={{
              fontSize: 88,
              fontWeight: 800,
              lineHeight: 1,
              backgroundImage: 'linear-gradient(180deg, #fff, var(--hot))',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {count}
          </span>
          <p className="text-sm" style={{ color: 'var(--dm)' }}>
            Live right now · 2 miles away
          </p>
          <p className="mt-6 max-w-xs text-base leading-relaxed" style={{ color: 'var(--tx)' }}>
            Real people, free at this moment, ready to meet. No texting. No planning.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          <div
            className={shakePhone ? 'anim-shake' : ''}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderRadius: 'var(--r)',
              border: `1px solid ${error ? 'var(--err)' : 'var(--s4)'}`,
              background: 'var(--s2)',
              padding: '0 16px',
              height: 54,
            }}
          >
            <span style={{ color: 'var(--dm)' }}>🇺🇸 +1</span>
            <input
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="305 555 1234"
              className="flex-1 bg-transparent outline-none"
              style={{ color: 'var(--tx)', fontSize: 17 }}
            />
          </div>
          {error && (
            <p className="text-sm" style={{ color: 'var(--err)' }}>
              {error}
            </p>
          )}
          <Button fullWidth size="lg" loading={loading} onClick={onImIn}>
            I&apos;m In
          </Button>
          <Button fullWidth variant="ghost" onClick={onHow}>
            How does this work?
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — How It Works
// ---------------------------------------------------------------------------
interface Step2Props {
  otpSent: boolean;
  otp: string;
  otpRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  shakeOtp: boolean;
  error: string;
  loading: boolean;
  resendIn: number;
  onOtpChange: (index: number, value: string) => void;
  onOtpKeyDown: (index: number, e: React.KeyboardEvent<HTMLInputElement>) => void;
  onResend: () => void;
  onPrimary: () => void;
}

const STEP2_CARDS = [
  {
    n: '01',
    color: 'var(--hot)',
    title: 'GO LIVE',
    body: 'Tap the button. Set your vibe. Your anonymous pin appears on the city map.',
  },
  {
    n: '02',
    color: 'var(--gold)',
    title: 'SPARK',
    body: 'Both spark each other within 7 minutes or it is gone forever. The urgency is the point.',
  },
  {
    n: '03',
    color: 'var(--green)',
    title: 'MEET',
    body: 'The app finds a midpoint Safe Zone venue. A shared countdown starts. You meet in under an hour.',
  },
];

function Step2(props: Step2Props): React.JSX.Element {
  const {
    otpSent,
    otp,
    otpRefs,
    shakeOtp,
    error,
    loading,
    resendIn,
    onOtpChange,
    onOtpKeyDown,
    onResend,
    onPrimary,
  } = props;
  return (
    <div className="min-h-screen px-6 pb-10 pt-20">
      <h1
        className="font-display italic"
        style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.05 }}
      >
        Meet someone in 60 minutes.
      </h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--dm)' }}>
        Three steps. No swiping. No texting for a week.
      </p>

      <div className="mt-6 space-y-3">
        {STEP2_CARDS.map((card, i) => (
          <div
            key={card.n}
            className="anim-fup flex gap-4 rounded-2xl p-4"
            style={{
              background: 'var(--s2)',
              border: '1px solid var(--s4)',
              animationDelay: `${[0.1, 0.22, 0.34][i]}s`,
            }}
          >
            <span
              className="font-display text-3xl font-extrabold italic"
              style={{ color: card.color }}
            >
              {card.n}
            </span>
            <div>
              <p className="font-bold uppercase tracking-wide" style={{ color: card.color }}>
                {card.title}
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--dm)' }}>
                {card.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      <blockquote
        className="mt-6 rounded-2xl p-4 text-sm italic"
        style={{ background: 'var(--s1)', border: '1px solid var(--hot)', color: 'var(--tx)' }}
      >
        &ldquo;I had zero plans on Thursday night. Opened RIGHTNOW, sparked someone in 4 minutes,
        had drinks at a rooftop I had never been to. We are going again Saturday.&rdquo;
        <footer className="mt-2 text-xs not-italic" style={{ color: 'var(--dm)' }}>
          Jordan K., Miami · Trust Score 96
        </footer>
      </blockquote>

      {otpSent && (
        <div className="mt-6">
          <p
            className="mb-2 text-xs font-bold uppercase tracking-wide"
            style={{ color: 'var(--dm)' }}
          >
            Enter the 6-digit code
          </p>
          <div className={`flex justify-between gap-2 ${shakeOtp ? 'anim-shake' : ''}`}>
            {Array.from({ length: 6 }, (_, i) => (
              <input
                key={i}
                ref={(el) => {
                  otpRefs.current[i] = el;
                }}
                inputMode="numeric"
                maxLength={1}
                value={otp[i] ?? ''}
                onChange={(e) => onOtpChange(i, e.target.value)}
                onKeyDown={(e) => onOtpKeyDown(i, e)}
                className="h-14 w-12 rounded-xl text-center text-2xl font-bold outline-none"
                style={{
                  background: 'var(--s2)',
                  border: `1px solid ${error ? 'var(--err)' : 'var(--s4)'}`,
                  color: 'var(--tx)',
                }}
              />
            ))}
          </div>
          {error && (
            <p className="mt-2 text-sm" style={{ color: 'var(--err)' }}>
              {error}
            </p>
          )}
          <p className="mt-2 text-xs" style={{ color: 'var(--mt)' }}>
            {resendIn > 0 ? (
              `Resend in ${resendIn}s`
            ) : (
              <button type="button" onClick={onResend} style={{ color: 'var(--hot)' }}>
                Resend code
              </button>
            )}
          </p>
        </div>
      )}

      <div className="mt-8">
        <Button fullWidth size="lg" loading={loading} onClick={onPrimary}>
          That&apos;s it. Let&apos;s go →
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Profile Setup
// ---------------------------------------------------------------------------
interface Step3Props {
  selectedEmoji: string;
  setSelectedEmoji: (e: string) => void;
  emojiOpen: boolean;
  setEmojiOpen: (v: boolean) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  selectedVibe: Vibe;
  setSelectedVibe: (v: Vibe) => void;
  onNext: () => void;
}

function Step3(props: Step3Props): React.JSX.Element {
  const {
    selectedEmoji,
    setSelectedEmoji,
    emojiOpen,
    setEmojiOpen,
    displayName,
    setDisplayName,
    selectedVibe,
    setSelectedVibe,
    onNext,
  } = props;
  return (
    <div className="min-h-screen px-6 pb-10 pt-20">
      <h1 className="font-display italic" style={{ fontSize: 38, fontWeight: 800 }}>
        Who are you tonight?
      </h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--dm)' }}>
        15 seconds. That&apos;s all it takes.
      </p>

      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={() => setEmojiOpen(!emojiOpen)}
          className="flex items-center justify-center rounded-3xl active:scale-95"
          style={{
            width: 100,
            height: 100,
            background: 'var(--s3)',
            border: '2px solid var(--hot)',
            fontSize: 52,
          }}
        >
          {selectedEmoji}
        </button>
      </div>

      {emojiOpen && (
        <div
          className="mt-4 grid grid-cols-6 gap-2 rounded-2xl p-3"
          style={{ background: 'var(--s1)' }}
        >
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                setSelectedEmoji(emoji);
                setEmojiOpen(false);
              }}
              className="flex h-10 items-center justify-center rounded-lg text-2xl active:scale-90"
              style={{ background: 'var(--s3)' }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <div
        className="mt-6 flex items-center gap-2 rounded-xl px-4"
        style={{ background: 'var(--s2)', border: '1px solid var(--s4)', height: 54 }}
      >
        <span style={{ color: 'var(--dm)' }}>👤</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="First name and age (e.g. Jordan 25)"
          maxLength={30}
          className="flex-1 bg-transparent outline-none"
          style={{ color: 'var(--tx)', fontSize: 16 }}
        />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {ONBOARD_VIBES.map((vibe) => {
          const active = selectedVibe === vibe;
          return (
            <button
              key={vibe}
              type="button"
              onClick={() => setSelectedVibe(vibe)}
              className="flex flex-col items-center gap-1 rounded-xl py-3 active:scale-95"
              style={{
                background: active ? 'rgba(255,92,0,0.15)' : 'var(--s2)',
                border: `1px solid ${active ? 'var(--hot)' : 'var(--s4)'}`,
                color: active ? 'var(--hot)' : 'var(--dm)',
              }}
            >
              <span className="text-2xl">{VIBES[vibe].emoji}</span>
              <span className="text-xs font-semibold">{VIBES[vibe].label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-8">
        <Button fullWidth size="lg" onClick={onNext}>
          Looking good →
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Notifications
// ---------------------------------------------------------------------------
const STEP4_CARDS = [
  {
    bg: 'rgba(255,92,0,0.12)',
    color: 'var(--hot)',
    icon: '⚡',
    title: 'Instant Spark Alerts',
    body: 'Know the moment someone sparks you. 7 minutes vanishes fast.',
  },
  {
    bg: 'rgba(255,215,0,0.12)',
    color: 'var(--gold)',
    icon: '🌃',
    title: 'City Activity Pulses',
    body: 'Sent only when it is actually worth going out tonight.',
  },
  {
    bg: 'rgba(0,229,91,0.12)',
    color: 'var(--green)',
    icon: '🛡️',
    title: 'Date Check-Ins',
    body: 'Safety pings during your date. Your trusted friend gets notified.',
  },
];

function Step4({
  loading,
  onEnable,
  onSkip,
}: {
  loading: boolean;
  onEnable: () => void;
  onSkip: () => void;
}): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col items-center px-6 pb-10 pt-20 text-center">
      <div className="relative flex h-32 w-32 items-center justify-center">
        <span
          className="anim-pring absolute h-20 w-20 rounded-full"
          style={{ background: 'rgba(255,92,0,0.25)' }}
        />
        <span
          className="anim-pring absolute h-20 w-20 rounded-full"
          style={{ background: 'rgba(255,92,0,0.15)', animationDelay: '0.6s' }}
        />
        <span
          className="relative flex items-center justify-center rounded-full"
          style={{
            width: 70,
            height: 70,
            background: 'var(--hot)',
            fontSize: 32,
            boxShadow: '0 0 40px var(--glow)',
          }}
        >
          🔔
        </span>
      </div>

      <h1 className="mt-6 font-display italic" style={{ fontSize: 34, fontWeight: 800 }}>
        Never miss a Spark.
      </h1>
      <p className="mt-1 text-sm" style={{ color: 'var(--dm)' }}>
        The 7-minute window moves fast.
      </p>

      <div className="mt-6 w-full space-y-3 text-left">
        {STEP4_CARDS.map((card) => (
          <div
            key={card.title}
            className="flex gap-3 rounded-2xl p-4"
            style={{ background: card.bg, border: `1px solid ${card.color}` }}
          >
            <span className="text-2xl">{card.icon}</span>
            <div>
              <p className="font-bold" style={{ color: card.color }}>
                {card.title}
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--tx)' }}>
                {card.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 w-full space-y-3">
        <Button fullWidth size="lg" loading={loading} onClick={onEnable}>
          Turn on Notifications
        </Button>
        <Button fullWidth variant="ghost" onClick={onSkip}>
          Maybe later
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — You're In
// ---------------------------------------------------------------------------
function Step5({
  liveNow,
  onGoLive,
}: {
  liveNow: number;
  onGoLive: () => void;
}): React.JSX.Element {
  const stats = [
    { value: String(liveNow), color: 'var(--hot)', label: 'Live now' },
    { value: '4.8★', color: 'var(--green)', label: 'Avg rating' },
    { value: '18m', color: 'var(--tx)', label: 'Avg to meet' },
  ];
  return (
    <div className="flex min-h-screen flex-col items-center px-6 pb-10 pt-20 text-center">
      <span
        className="anim-bloom flex items-center justify-center rounded-full"
        style={{
          width: 110,
          height: 110,
          background: 'var(--hot)',
          fontSize: 52,
          boxShadow: '0 0 50px var(--glow)',
        }}
      >
        ⚡
      </span>

      <h1
        className="mt-6 font-display italic"
        style={{ fontSize: 52, fontWeight: 800, lineHeight: 1 }}
      >
        You&apos;re in, Miami.
      </h1>
      <p
        className="mt-2 text-xs font-bold uppercase tracking-[0.25em]"
        style={{ color: 'var(--dm)' }}
      >
        Verified · Secure · Live
      </p>

      <div className="mt-6 grid w-full grid-cols-3 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl py-4"
            style={{ background: 'var(--s2)', border: '1px solid var(--s4)' }}
          >
            <p className="font-display text-2xl font-extrabold" style={{ color: s.color }}>
              {s.value}
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--dm)' }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      <div
        className="mt-6 w-full rounded-2xl p-4 text-left text-sm"
        style={{
          background: 'rgba(0,229,91,0.1)',
          border: '1px solid var(--green)',
          color: 'var(--tx)',
        }}
      >
        🛡️ Your profile is anonymous until you match. Location is approximate. No one sees your
        exact spot.
      </div>

      <div className="mt-8 w-full">
        <Button fullWidth size="lg" onClick={onGoLive}>
          GO LIVE Now
        </Button>
      </div>
    </div>
  );
}
