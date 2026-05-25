import Stripe from 'stripe';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { pool } from '../db/index.js';
import { redis } from '../db/redis.js';
import type { Plan } from './plan.service.js';

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured (missing STRIPE_SECRET_KEY)');
  }
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export type BillingPeriod = 'monthly' | 'annual';
export const BOOST_AMOUNT_CENTS = 299;

interface CatalogEntry {
  lookupKey: string;
  product: string;
  amount: number;
  interval?: 'month' | 'year';
}

const SUBSCRIPTION_CATALOG: CatalogEntry[] = [
  {
    lookupKey: 'rightnow_plus_monthly',
    product: 'RIGHTNOW+ Monthly',
    amount: 1499,
    interval: 'month',
  },
  {
    lookupKey: 'rightnow_plus_annual',
    product: 'RIGHTNOW+ Annual',
    amount: 6900,
    interval: 'year',
  },
  { lookupKey: 'rightnow_vip_monthly', product: 'VIP Monthly', amount: 2999, interval: 'month' },
  { lookupKey: 'rightnow_vip_annual', product: 'VIP Annual', amount: 13700, interval: 'year' },
];
const BOOST_ENTRY: CatalogEntry = {
  lookupKey: 'rightnow_pin_boost',
  product: 'Pin Boost',
  amount: BOOST_AMOUNT_CENTS,
};

const priceCache = new Map<string, string>();

const lookupKeyFor = (plan: Plan, period: BillingPeriod): string => `rightnow_${plan}_${period}`;

async function ensurePrice(entry: CatalogEntry): Promise<void> {
  const stripe = getStripe();
  const existing = await stripe.prices.list({
    lookup_keys: [entry.lookupKey],
    active: true,
    limit: 1,
  });
  if (existing.data[0]) {
    priceCache.set(entry.lookupKey, existing.data[0].id);
    return;
  }
  const product = await stripe.products.create({ name: entry.product });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: entry.amount,
    currency: 'usd',
    lookup_key: entry.lookupKey,
    ...(entry.interval ? { recurring: { interval: entry.interval } } : {}),
  });
  priceCache.set(entry.lookupKey, price.id);
}

/** Create the products/prices on startup if they don't already exist. */
export async function ensureStripeCatalog(): Promise<void> {
  if (!isStripeConfigured()) return;
  for (const entry of [...SUBSCRIPTION_CATALOG, BOOST_ENTRY]) {
    await ensurePrice(entry);
  }
  logger.info('Stripe catalog ready');
}

async function getPriceId(lookupKey: string): Promise<string> {
  const cached = priceCache.get(lookupKey);
  if (cached) return cached;
  await ensureStripeCatalog();
  const id = priceCache.get(lookupKey);
  if (!id) throw new Error(`Stripe price not found: ${lookupKey}`);
  return id;
}

/** Get the user's Stripe customer id, creating (and caching) one if needed. */
export async function getOrCreateCustomer(userId: string, phone?: string): Promise<string> {
  const cacheKey = `stripe_customer:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  const existing = await pool.query<{ stripe_customer_id: string }>(
    'SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1 AND stripe_customer_id IS NOT NULL LIMIT 1',
    [userId],
  );
  if (existing.rows[0]?.stripe_customer_id) {
    await redis.set(cacheKey, existing.rows[0].stripe_customer_id);
    return existing.rows[0].stripe_customer_id;
  }

  const customer = await getStripe().customers.create({
    metadata: { userId },
    ...(phone ? { phone } : {}),
  });
  await redis.set(cacheKey, customer.id);
  return customer.id;
}

/** SetupIntent to collect a payment method for later subscription billing. */
export async function createSetupIntent(
  customerId: string,
): Promise<{ clientSecret: string | null; customerId: string }> {
  const intent = await getStripe().setupIntents.create({ customer: customerId });
  return { clientSecret: intent.client_secret, customerId };
}

/** Create a subscription with a free trial using a collected payment method. */
export async function createSubscription(params: {
  customerId: string;
  userId: string;
  plan: Plan;
  period: BillingPeriod;
  paymentMethodId: string;
  trialDays: number;
}): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  const priceId = await getPriceId(lookupKeyFor(params.plan, params.period));
  await stripe.paymentMethods.attach(params.paymentMethodId, { customer: params.customerId });
  await stripe.customers.update(params.customerId, {
    invoice_settings: { default_payment_method: params.paymentMethodId },
  });
  return stripe.subscriptions.create({
    customer: params.customerId,
    items: [{ price: priceId }],
    trial_period_days: params.trialDays,
    metadata: { userId: params.userId, plan: params.plan },
  });
}

/** Trial-only subscription (no payment method) used for referral rewards. */
export async function createTrialSubscription(params: {
  customerId: string;
  userId: string;
  plan: Plan;
  period: BillingPeriod;
  trialDays: number;
}): Promise<Stripe.Subscription> {
  const priceId = await getPriceId(lookupKeyFor(params.plan, params.period));
  return getStripe().subscriptions.create({
    customer: params.customerId,
    items: [{ price: priceId }],
    trial_period_days: params.trialDays,
    trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
    payment_settings: { save_default_payment_method: 'on_subscription' },
    metadata: { userId: params.userId, plan: params.plan, source: 'referral' },
  });
}

export async function cancelAtPeriodEnd(subscriptionId: string): Promise<Stripe.Subscription> {
  return getStripe().subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

export async function createBoostPaymentIntent(
  userId: string,
  sessionId: string,
): Promise<{ clientSecret: string | null }> {
  const intent = await getStripe().paymentIntents.create({
    amount: BOOST_AMOUNT_CENTS,
    currency: 'usd',
    metadata: { userId, sessionId, kind: 'boost' },
  });
  return { clientSecret: intent.client_secret };
}

export async function retrievePaymentIntent(id: string): Promise<Stripe.PaymentIntent> {
  return getStripe().paymentIntents.retrieve(id);
}

/** Create a Checkout session for a Boost or RIGHTNOW+ purchase. */
export async function createCheckoutSession(params: {
  priceId: string;
  customerId?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  return getStripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: params.priceId, quantity: 1 }],
    customer: params.customerId,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
}

/** Create a Stripe Identity verification session for government-ID checks. */
export async function createIdentitySession(
  userId: string,
  returnUrl?: string,
): Promise<{ clientSecret: string | null; url: string | null }> {
  const session = await getStripe().identity.verificationSessions.create({
    type: 'document',
    metadata: { userId },
    ...(returnUrl ? { return_url: returnUrl } : {}),
  });
  return { clientSecret: session.client_secret, url: session.url };
}

/** Verify and parse a Stripe webhook payload. */
export function constructWebhookEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is required to verify webhooks');
  }
  return getStripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}
