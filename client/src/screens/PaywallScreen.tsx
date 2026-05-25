import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Button from '@/components/Button';
import { useToast } from '@/hooks/useToast';
import { useSubscriptionStore, type Plan } from '@/store/useSubscriptionStore';
import { createSubscription, getViewedCount, restorePurchases } from '@/services/api';

type Billing = 'monthly' | 'annual';

const PRICING: Record<
  Exclude<Plan, 'free'>,
  Record<Billing, { display: string; sub: string; was?: string }>
> = {
  plus: {
    monthly: { display: '$14.99', sub: 'per month' },
    annual: { display: '$5.75', sub: 'per month · billed $69/yr', was: '$14.99' },
  },
  vip: {
    monthly: { display: '$29.99', sub: 'per month' },
    annual: { display: '$11.42', sub: 'per month · billed $137/yr', was: '$29.99' },
  },
};

const PLANS = [
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
  const [billing, setBilling] = useState<Billing>('annual');
  const [selected, setSelected] = useState<Plan>('plus');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getViewedCount()
      .then((r) => setViewed(r.count))
      .catch(() => undefined);
  }, []);

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
      : selected === 'vip'
        ? 'Start 3-Day Free Trial · VIP'
        : 'Start 3-Day Free Trial';
  const ctaVariant = selected === 'vip' ? 'gold' : selected === 'free' ? 'ghost' : 'primary';

  return (
    <div className="min-h-screen" style={{ background: 'var(--s0)', color: 'var(--tx)' }}>
      <header className="flex items-center justify-between px-5 pt-5">
        <button type="button" onClick={() => navigate(-1)} className="text-xl">
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
          {(['monthly', 'annual'] as Billing[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBilling(b)}
              className="relative flex-1 rounded-full py-2 text-sm font-bold capitalize"
              style={{
                background:
                  billing === b ? 'linear-gradient(135deg, var(--hot), #ff8c00)' : 'transparent',
                color: billing === b ? '#fff' : 'var(--dm)',
              }}
            >
              {b}
              {b === 'annual' && (
                <span
                  className="ml-1 rounded-full px-1.5 py-0.5 text-[10px]"
                  style={{ background: 'rgba(0,229,91,0.2)', color: 'var(--green)' }}
                >
                  Save 62%
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Plan cards */}
        <div className="space-y-3">
          {PLANS.map((p) => {
            const isSel = selected === p.key;
            const price = p.key !== 'free' ? PRICING[p.key][billing] : null;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setSelected(p.key)}
                className="block w-full rounded-2xl p-4 text-left"
                style={{
                  background: 'var(--s1)',
                  border: `2px solid ${isSel ? p.accent : 'var(--s3)'}`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full"
                      style={{ border: `2px solid ${isSel ? p.accent : 'var(--s4)'}` }}
                    >
                      {isSel && (
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: p.accent }}
                        />
                      )}
                    </span>
                    <span
                      className="font-display text-lg font-bold"
                      style={{ color: p.key === 'vip' ? 'var(--gold)' : 'var(--tx)' }}
                    >
                      {p.name}
                    </span>
                    {p.badge && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: 'rgba(255,92,0,0.15)', color: p.accent }}
                      >
                        {p.badge}
                      </span>
                    )}
                  </div>
                  {p.key === 'free' && (
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
                      <span className="font-bold" style={{ color: p.accent }}>
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
                  {p.features.map((f) => (
                    <li key={f} style={{ color: 'var(--tx)' }}>
                      <span style={{ color: p.key === 'vip' ? 'var(--gold)' : 'var(--hot)' }}>
                        {p.key === 'vip' ? '★' : '✓'}
                      </span>{' '}
                      {f}
                    </li>
                  ))}
                  {p.locked.map((f) => (
                    <li key={f} style={{ color: 'var(--mt)' }}>
                      — {f}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
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
    </div>
  );
}

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
