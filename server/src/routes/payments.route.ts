import type { FastifyInstance } from 'fastify';
import type Stripe from 'stripe';
import { z } from 'zod';

import { logger } from '../utils/logger.js';
import { pool } from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { notFound } from '../utils/http-error.js';
import {
  getOrCreateCustomer,
  createSetupIntent,
  createSubscription,
  cancelAtPeriodEnd,
  constructWebhookEvent,
} from '../services/stripe.service.js';
import { setUserPlan, clearUserPlan, type Plan } from '../services/plan.service.js';
import { sendPushNotification } from '../services/notifications.service.js';
import { emitToUser } from '../socket/emitter.js';

const SUBSCRIPTION_TRIAL_DAYS = 3;
const BOOST_DURATION_MS = 60 * 60 * 1000;

const createSubBody = z.object({
  plan: z.enum(['plus', 'vip']),
  period: z.enum(['monthly', 'annual']),
});
const confirmSubBody = z.object({
  paymentMethodId: z.string().min(1),
  plan: z.enum(['plus', 'vip']),
  period: z.enum(['monthly', 'annual']),
});
function subStatus(stripeStatus: Stripe.Subscription.Status): string {
  // Map Stripe statuses onto our allowed set.
  if (stripeStatus === 'trialing') return 'trialing';
  if (stripeStatus === 'active') return 'active';
  if (stripeStatus === 'past_due' || stripeStatus === 'unpaid') return 'past_due';
  return 'cancelled';
}

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  // Collect a payment method via SetupIntent.
  app.post(
    '/payments/create-subscription',
    { preHandler: authenticateToken },
    async (request, reply) => {
      createSubBody.parse(request.body);
      const { userId, phone } = request.user;
      const customerId = await getOrCreateCustomer(userId, phone);
      const { clientSecret } = await createSetupIntent(customerId);
      return reply.send({ clientSecret, customerId });
    },
  );

  // Create the subscription with a 3-day trial.
  app.post(
    '/payments/confirm-subscription',
    { preHandler: authenticateToken },
    async (request, reply) => {
      const { paymentMethodId, plan, period } = confirmSubBody.parse(request.body);
      const { userId, phone } = request.user;
      const customerId = await getOrCreateCustomer(userId, phone);

      const subscription = await createSubscription({
        customerId,
        userId,
        plan,
        period,
        paymentMethodId,
        trialDays: SUBSCRIPTION_TRIAL_DAYS,
      });

      // `current_period_end` location varies across Stripe API versions.
      const periodEnd =
        (subscription as unknown as { current_period_end?: number }).current_period_end ??
        subscription.trial_end ??
        null;
      await pool.query(
        `INSERT INTO subscriptions
         (user_id, plan, billing_period, status, trial_ends_at, current_period_end,
          stripe_customer_id, stripe_subscription_id)
       VALUES ($1, $2, $3, $4,
               to_timestamp($5), to_timestamp($6), $7, $8)`,
        [
          userId,
          plan,
          period,
          subStatus(subscription.status),
          subscription.trial_end,
          periodEnd,
          customerId,
          subscription.id,
        ],
      );
      await setUserPlan(userId, plan as Plan);

      return reply.send({
        subscription: { id: subscription.id, status: subscription.status, plan, period },
        planActive: true,
      });
    },
  );

  // Restore purchases — resolve and re-cache the user's current plan.
  app.get('/payments/restore', { preHandler: authenticateToken }, async (request, reply) => {
    const { userId } = request.user;
    const { rows } = await pool.query<{ plan: string; status: string }>(
      `SELECT plan, status FROM subscriptions
        WHERE user_id = $1 AND status IN ('active', 'trialing', 'cancelling')
        ORDER BY current_period_end DESC NULLS LAST LIMIT 1`,
      [userId],
    );
    const plan = (rows[0]?.plan as Plan) ?? 'free';
    await setUserPlan(userId, plan);
    return reply.send({ plan, status: rows[0]?.status ?? 'none' });
  });

  // Cancel at period end.
  app.post('/payments/cancel', { preHandler: authenticateToken }, async (request, reply) => {
    const { userId } = request.user;
    const sub = await pool.query<{
      stripe_subscription_id: string | null;
      current_period_end: Date | null;
    }>(
      `SELECT stripe_subscription_id, current_period_end FROM subscriptions
        WHERE user_id = $1 AND status IN ('active', 'trialing')
        ORDER BY current_period_end DESC NULLS LAST LIMIT 1`,
      [userId],
    );
    if (sub.rows.length === 0) throw notFound('No active subscription to cancel.');

    const stripeSubId = sub.rows[0]!.stripe_subscription_id;
    if (stripeSubId) {
      await cancelAtPeriodEnd(stripeSubId).catch((err) =>
        logger.warn({ err }, 'Stripe cancel-at-period-end failed'),
      );
    }
    await pool.query(
      "UPDATE subscriptions SET status = 'cancelling' WHERE user_id = $1 AND status IN ('active', 'trialing')",
      [userId],
    );

    return reply.send({ success: true, endsAt: sub.rows[0]!.current_period_end });
  });

  // Stripe webhook — raw body, no auth.
  await app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
      done(null, body);
    });

    scope.post('/payments/webhook', async (request, reply) => {
      const signature = request.headers['stripe-signature'];
      if (typeof signature !== 'string') {
        return reply
          .status(400)
          .send({ error: 'BadRequest', message: 'Missing signature', statusCode: 400 });
      }
      let event: Stripe.Event;
      try {
        event = constructWebhookEvent(request.body as Buffer, signature);
      } catch (err) {
        logger.warn({ err }, 'Stripe webhook signature verification failed');
        return reply
          .status(400)
          .send({ error: 'BadRequest', message: 'Invalid signature', statusCode: 400 });
      }

      await handleWebhookEvent(event).catch((err) =>
        logger.error({ err, type: event.type }, 'webhook handler failed'),
      );
      return reply.send({ received: true });
    });
  });
}

async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata.userId;
      const plan = (sub.metadata.plan as Plan) ?? 'free';
      if (!userId) return;
      const periodEnd =
        (sub as unknown as { current_period_end?: number }).current_period_end ?? null;
      await pool.query(
        `UPDATE subscriptions
            SET status = $1,
                current_period_end = CASE WHEN $3::bigint IS NOT NULL THEN to_timestamp($3) ELSE current_period_end END
          WHERE stripe_subscription_id = $2`,
        [subStatus(sub.status), sub.id, periodEnd],
      );
      if (sub.status === 'active' || sub.status === 'trialing') {
        await setUserPlan(userId, plan);
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const metaUserId = sub.metadata.userId;
      await pool.query(
        "UPDATE subscriptions SET status = 'cancelled' WHERE stripe_subscription_id = $1",
        [sub.id],
      );
      // Use metadata userId if present; otherwise look it up from the DB so the
      // Redis plan cache is always cleared even when metadata was not populated.
      const userId =
        metaUserId ??
        (
          await pool.query<{ user_id: string }>(
            'SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1 LIMIT 1',
            [sub.id],
          )
        ).rows[0]?.user_id;
      if (userId) await clearUserPlan(userId);
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : null;
      if (customerId) {
        const res = await pool.query<{ user_id: string }>(
          'SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1 LIMIT 1',
          [customerId],
        );
        const userId = res.rows[0]?.user_id;
        if (userId) {
          await sendPushNotification(userId, {
            title: 'Payment failed',
            body: 'We could not process your RIGHTNOW payment. Please update your card.',
          });
        }
      }
      break;
    }
    case 'payment_intent.succeeded': {
      const intent = event.data.object as Stripe.PaymentIntent;
      if (intent.metadata.kind === 'boost' && intent.metadata.userId && intent.metadata.sessionId) {
        const boostEndsAt = new Date(Date.now() + BOOST_DURATION_MS);
        await pool.query(
          `INSERT INTO boosts (user_id, session_id, stripe_payment_intent_id, boost_start, boost_end, is_active)
           VALUES ($1, $2, $3, NOW(), $4, true)
           ON CONFLICT DO NOTHING`,
          [intent.metadata.userId, intent.metadata.sessionId, intent.id, boostEndsAt],
        );
        emitToUser(intent.metadata.userId, 'boost:activated', {
          sessionId: intent.metadata.sessionId,
          boostEndsAt: boostEndsAt.toISOString(),
        });
      }
      break;
    }
    default:
      break;
  }
}
