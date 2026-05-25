import Stripe from 'stripe';
import { env } from '../utils/env.js';

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured (missing STRIPE_SECRET_KEY)');
  }
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
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

/** Verify and parse a Stripe webhook payload. */
export function constructWebhookEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is required to verify webhooks');
  }
  return getStripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}
