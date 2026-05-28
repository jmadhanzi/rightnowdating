import { memo, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Button from '@/components/Button';
import { useToast } from '@/hooks/useToast';
import { useSubscriptionStore, type Plan } from '@/store/useSubscriptionStore';
import { createSubscription, getViewedCount, restorePurchases } from '@/services/api';

type Billing = 'weekly' | 'monthly' | 'annual';

const PRICING: Record<
  Exclude<Plan, 'free'>,
  Record<Billing, { display: string; sub: string; was?: string }>
> = {
  plus: {
    weekly: { display: '$7.99', sub: 'per week · 3-day free trial', was: undefined },
    monthly: { display: '$14.99', sub: 'per month' },
    annual: { display: '$5.75', sub: 'per month · billed $69/yr', was: '$14.99' },
  },
  vip: {
    weekly: { display: '$12.99', sub: 'per week · 3-day free trial', was: undefined },
    monthly: { display: '$29.99', sub: 'per month' },
    annual: { display: '$11.42', sub: 'per month · billed $137/yr', was: '$29.99' },
  },
};

type PlanCardData = {
  key: Plan;
  name: string;
  badge?: string;
  features: string[];
  locked: string[];
  accent: string;
};

const PLANS: PlanCardData[] = [
  {
    key: 'free' as Plan,
    name: 'Free',
    features: ['Go live 2×/day', 'See nearby pins', 'Basic matching'],
    locked: ['See who sparked you', 'Unlimited live', 'Priority placement'],
    accent: 'var(--s5)',
  },
  {
    key: 'plus' as Plan,
    name: 'RIGHTNOW+',
    badge: 'Most Popular',
    features: [
      'Everything in Free',
      'See who sparked you',
      'Unlimited live sessions',
      'Read receipts',
    ],
    locked: [],
    accent: 'var(--hot)',
  },
  {
    key: 'vip' as Plan,
    name: 'VIP',
    badge: 'Best Value',
    features: [
      'Everything in RIGHTNOW+',
      'Invisible mode',
      'Priority pin placement',
      'Monthly boost credits',
    ],
    locked: [],
    accent: 'var(--gold)',
  },
];

const TESTIMONIALS = [
  {
    name: 'Marcus T.',
    meta: 'Miami · VIP',
    text: 'The invisible mode is insane. I get 5x more sparks on Friday nights.',
  },
  {
    name: 'Sofia R.',
    meta: 'Austin · RIGHTNOW+',
    text: 'Seeing who sparked me is worth the price alone.',
  },
  {
    name: 'Kai L.',
    meta: 'NYC · VIP',
    text: '11 dates in 3 months. The boost credits alone paid for themselves.',
  },
];

export default function PaywallScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const setPlan = useSubscriptionStore((s) => s.setPlan);

  const [viewed, setViewed] = useState(0);
  const [billing, setBilling] = useState<Billing>('weekly');
  const [selected, setSelected] = useState<Plan>('plus');
  const [loading, setLoading] = useState(false);
  const [showFlashSale, setShowFlashSale] = useState(false);
  const [flashSecondsLeft, setFlashSecondsLeft] = useState(24 * 60 * 60); // 24h countdown

  useEffect(() => {
    getViewedCount()
      .then((r) => setViewed(r.count))
      .catch(() => undefined);
  }, []);

  // Flash sale countdown timer
  useEffect(() => {
    if (!showFlashSale) return;
    const id = setInterval(() => {
      setFlashSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [showFlashSale]);

  const formatFlashTime = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleClose = (): void => {
    // Intercept close — show flash sale first
    if (!showFlashSale) {
      setShowFlashSale(true);
    } else {
      navigate(-1);
    }
  };

  const restore = (): void => {
    restorePurchases()
      .then((r) => {
        setPlan(r.plan as Plan);
        toast.success(
          r.plan === 'free' ? 'No active plan found' : `Restored ${r.plan.toUpperCase()}`,
        );
      })
      .catch(() => toast.error('Could not restore'));
  };

  const cta = async (): Promise<void> => {
    if (selected === 'free') {
      navigate('/live');
      return;
    }
    setLoading(true);
    try {
      await createSubscription(selected, billing);
      toast.info('Opening secure checkout…');
      // Stripe Elements payment sheet would mount here with the returned clientSecret.
    } catch {
      toast.error('Could not start checkout');
    } finally {
      setLoading(false);
    }
  };

  const ctaLabel =
    selected === 'free'
      ? 'Continue with Free'
      : billing === 'weekly'
        ? selected === 'vip'
          ? 'Start Free Trial · VIP Weekend'
          : 'Start Free Trial · This Weekend'
        : selected === 'vip'
          ? 'Start 3-Day Free Trial · VIP'
          : 'Start 3-Day Free Trial';
  const ctaVariant = selected === 'vip' ? 'gold' : selected === 'free' ? 'ghost' : 'primary';

  return (
    <div className="relative min-h-screen" style={{ background: 'var(--s0)', color: 'var(--tx)' }}>
      <header className="flex items-center justify-between px-5 pt-5">
        <button type="button" onClick={handleClose} className="text-xl">
          ✕
        </button>
        <span
          className="font-display text-lg font-extrabold italic"
          style={{ color: 'var(--hot)' }}
        >
          RIGHTNOW
        </span>
        <button
          type="button"
          onClick={restore}
          className="text-sm font-bold uppercase"
          style={{ color: 'var(--dm)' }}
        >
          Restore
        </button>
      </header>

      <div className="space-y-6 px-5 pb-32 pt-4">
        {/* Hero */}
        <div>
          <span
            className="inline-flex items-center gap-2 text-sm font-bold"
            style={{ color: 'var(--hot)' }}
          >
            <span className="anim-dp h-2 w-2 rounded-full" style={{ background: 'var(--hot)' }} />
            {viewed} people sparked you today
          </span>
          <h1
            className="mt-2 font-display italic"
            style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.05 }}
          >
            <span style={{ color: 'var(--hot)' }}>Unlock</span> who is waiting for you.
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--dm)' }}>
            Upgrade to see who sparked you, go live unlimited, and get priority map placement.
          </p>
        </div>

        {/* Missed sparks */}
        <div className="flex gap-3 overflow-x-auto">
          <MissedCard emoji="🧑" name="You" blurred={false} />
          {[0, 1, 2].map((i) => (
            <MissedCard key={i} emoji="🔒" name="••••" blurred />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSelected('plus')}
          className="w-full rounded-xl p-3 text-left text-sm"
          style={{ background: 'var(--s1)', border: '1px solid var(--s3)', color: 'var(--dm)' }}
        >
          {viewed} people sparked you since 8pm ·{' '}
          <span style={{ color: 'var(--hot)' }}>Upgrade to see →</span>
        </button>

        {/* Billing toggle */}
        <div
          className="mx-auto flex max-w-xs rounded-full p-1"
          style={{ background: 'var(--s2)', border: '1px solid var(--s4)' }}
        >
          {(['weekly', 'monthly', 'annual'] as Billing[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBilling(b)}
              className="relative flex-1 rounded-full py-2 text-xs font-bold capitalize"
              style={{
                background:
                  billing === b ? 'linear-gradient(135deg, var(--hot), #ff8c00)' : 'transparent',
                color: billing === b ? '#fff' : 'var(--dm)',
              }}
            >
              {b === 'weekly' ? 'Weekend' : b}
              {b === 'annual' && (
                <span
                  className="ml-1 rounded-full px-1.5 py-0.5 text-[10px]"
                  style={{ background: 'rgba(0,229,91,0.2)', color: 'var(--green)' }}
                >
                  Save 62%
                </span>
              )}
              {b === 'weekly' && (
                <span
                  className="ml-1 rounded-full px-1.5 py-0.5 text-[10px]"
                  style={{ background: 'rgba(255,215,0,0.2)', color: 'var(--gold)' }}
                >
                  Trial
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Weekly plan nudge copy */}
        {billing === 'weekly' && (
          <div
            className="rounded-xl px-4 py-2 text-center text-sm"
            style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.3)' }}
          >
            <span style={{ color: 'var(--gold)' }}>🎉</span>{' '}
            <span style={{ color: 'var(--tx)' }}>
              Unlock premium <strong>just for this weekend.</strong> 3 days free, then billed weekly. Cancel anytime.
            </span>
          </div>
        )}

        {/* Plan cards — role=radiogroup so screen readers announce as selection group */}
        <div
          className="space-y-3"
          role="radiogroup"
          aria-label="Select a subscription plan"
        >
          {PLANS.map((p) => (
            <PlanCard
              key={p.key}
              plan={p}
              billing={billing}
              selected={selected === p.key}
              onSelect={onSelectPlan}
            />
          ))}
        </div>

        {/* Social proof */}
        <div
          className="flex items-center gap-3 rounded-2xl p-4"
          style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
        >
          <div className="flex">
            {['😎', '💃', '🕺', '🦊'].map((e, i) => (
              <span
                key={e}
                className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{
                  background: 'var(--s3)',
                  border: '2px solid var(--s1)',
                  marginLeft: i ? -10 : 0,
                }}
              >
                {e}
              </span>
            ))}
          </div>
          <p className="text-xs" style={{ color: 'var(--dm)' }}>
            2,847 VIP users in Miami · 3x more sparks with priority pin
          </p>
        </div>

        {/* Testimonials */}
        <div className="flex gap-3 overflow-x-auto">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="w-64 shrink-0 rounded-2xl p-4"
              style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
            >
              <p style={{ color: 'var(--gold)' }}>★★★★★</p>
              <p className="mt-1 text-sm" style={{ color: 'var(--tx)' }}>
                {t.text}
              </p>
              <p className="mt-2 text-xs" style={{ color: 'var(--dm)' }}>
                {t.name} · {t.meta}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Sticky CTA */}
      <div
        className="fixed bottom-0 left-0 right-0 px-5 py-4"
        style={{
          background: 'rgba(8,8,8,0.95)',
          backdropFilter: 'blur(16px)',
          borderTop: '1px solid var(--s3)',
        }}
      >
        <Button fullWidth size="lg" variant={ctaVariant} loading={loading} onClick={cta}>
          {ctaLabel}
        </Button>
        <p className="mt-2 text-center text-[11px]" style={{ color: 'var(--mt)' }}>
          Cancel anytime · No questions asked · Secure payment
        </p>
      </div>

      {/* Flash Sale Bottom Sheet */}
      {showFlashSale && (
        <div
          className="anim-su fixed inset-0 z-50 flex items-end"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="w-full rounded-t-3xl px-6 pb-10 pt-6"
            style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
          >
            {/* Flash badge */}
            <div className="mb-4 flex items-center justify-center gap-2">
              <span
                className="rounded-full px-4 py-1 text-xs font-black uppercase tracking-widest"
                style={{ background: 'var(--hot)', color: '#fff' }}
              >
                ⚡ FLASH SALE
              </span>
            </div>

            <h2
              className="text-center font-display italic"
              style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.05 }}
            >
              Wait! 50% off
              <br />
              <span style={{ color: 'var(--hot)' }}>your first week</span>
            </h2>
            <p className="mt-2 text-center text-sm" style={{ color: 'var(--dm)' }}>
              Don't miss your matches tonight. This deal expires in:
            </p>

            {/* Countdown */}
            <div className="mt-4 flex justify-center gap-2">
              {formatFlashTime(flashSecondsLeft)
                .split(':')
                .map((segment, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <span
                      className="flex h-14 w-16 items-center justify-center rounded-xl font-display text-3xl font-black"
                      style={{ background: 'var(--s3)', color: 'var(--hot)' }}
                    >
                      {segment}
                    </span>
                    <span className="mt-1 text-[10px]" style={{ color: 'var(--mt)' }}>
                      {['HRS', 'MIN', 'SEC'][i]}
                    </span>
                  </div>
                ))}
            </div>

            {/* Flash deal pricing */}
            <div
              className="mt-5 rounded-2xl p-4 text-center"
              style={{ background: 'rgba(255,92,0,0.1)', border: '1px solid var(--hot)' }}
            >
              <div className="flex items-center justify-center gap-3">
                <span className="text-xl line-through" style={{ color: 'var(--mt)' }}>
                  $7.99
                </span>
                <span
                  className="font-display text-4xl font-black italic"
                  style={{ color: 'var(--hot)' }}
                >
                  $3.99
                </span>
              </div>
              <p className="mt-1 text-xs" style={{ color: 'var(--dm)' }}>
                First week only · Then $7.99/wk · Cancel anytime
              </p>
            </div>

            <div className="mt-5 space-y-3">
              <Button
                fullWidth
                size="lg"
                onClick={() => {
                  setShowFlashSale(false);
                  setBilling('weekly');
                  setSelected('plus');
                  void cta();
                }}
              >
                Claim 50% Off — $3.99 This Week
              </Button>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="w-full py-2 text-sm"
                style={{ color: 'var(--mt)' }}
              >
                No thanks, I'll pay full price later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const PlanCard = memo(function PlanCard({
  plan,
  billing,
  selected,
  onSelect,
}: {
  plan: PlanCardData;
  billing: Billing;
  selected: boolean;
  onSelect: (key: Plan) => void;
}): React.JSX.Element {
  const price = plan.key !== 'free' ? PRICING[plan.key][billing] : null;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${plan.name} plan${plan.key !== 'free' && PRICING[plan.key as Exclude<Plan,'free'>] ? ` — ${PRICING[plan.key as Exclude<Plan,'free'>][billing].display} ${PRICING[plan.key as Exclude<Plan,'free'>][billing].sub}` : ''}`}
      onClick={() => onSelect(plan.key)}
      className="block w-full rounded-2xl p-4 text-left focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s0)]"
      style={{
        background: 'var(--s1)',
        border: `2px solid ${selected ? plan.accent : 'var(--s3)'}`,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full"
            style={{ border: `2px solid ${selected ? plan.accent : 'var(--s4)'}` }}
          >
            {selected && (
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: plan.accent }} />
            )}
          </span>
          <span
            className="font-display text-lg font-bold"
            style={{ color: plan.key === 'vip' ? 'var(--gold)' : 'var(--tx)' }}
          >
            {plan.name}
          </span>
          {plan.badge && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: 'rgba(255,92,0,0.15)', color: plan.accent }}
            >
              {plan.badge}
            </span>
          )}
        </div>
        {plan.key === 'free' && (
          <span className="text-xs" style={{ color: 'var(--mt)' }}>
            Current
          </span>
        )}
        {price && (
          <div className="text-right">
            {price.was && billing === 'annual' && (
              <span className="mr-1 text-xs line-through" style={{ color: 'var(--mt)' }}>
                {price.was}
              </span>
            )}
            <span className="font-bold" style={{ color: plan.accent }}>
              {price.display}
            </span>
          </div>
        )}
      </div>
      {price && (
        <p className="mt-0.5 text-right text-[11px]" style={{ color: 'var(--mt)' }}>
          {price.sub}
        </p>
      )}
      <ul className="mt-2 space-y-1 text-sm">
        {plan.features.map((f) => (
          <li key={f} style={{ color: 'var(--tx)' }}>
            <span style={{ color: plan.key === 'vip' ? 'var(--gold)' : 'var(--hot)' }}>
              {plan.key === 'vip' ? '★' : '✓'}
            </span>{' '}
            {f}
          </li>
        ))}
        {plan.locked.map((f) => (
          <li key={f} style={{ color: 'var(--mt)' }}>
            — {f}
          </li>
        ))}
      </ul>
    </button>
  );
});

function MissedCard({
  emoji,
  name,
  blurred,
}: {
  emoji: string;
  name: string;
  blurred: boolean;
}): React.JSX.Element {
  return (
    <div
      className="flex w-28 shrink-0 flex-col items-center gap-1 rounded-2xl p-3 text-center"
      style={{ background: 'var(--s1)', border: '1px solid var(--s3)' }}
    >
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full text-2xl"
        style={{ background: 'var(--s3)', filter: blurred ? 'blur(2px)' : 'none' }}
      >
        {emoji}
      </span>
      <span className="text-sm font-bold" style={{ color: blurred ? 'var(--mt)' : 'var(--tx)' }}>
        {name}
      </span>
      <span className="text-xs" style={{ color: 'var(--mt)' }}>
        {blurred ? '•• mi' : 'You'}
      </span>
    </div>
  );
}
