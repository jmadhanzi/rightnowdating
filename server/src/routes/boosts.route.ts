import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { pool, transaction } from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePlan } from '../middleware/planCheck.js';
import { badRequest } from '../utils/http-error.js';
import { createBoostPaymentIntent, retrievePaymentIntent } from '../services/stripe.service.js';
import { scheduleBoostExpiry, BOOST_DURATION_MS } from '../services/queue.service.js';
import { emitToUser, emitToCity } from '../socket/emitter.js';
import { routeRateLimit } from '../middleware/rateLimit.js';

const purchaseBody = z.object({ sessionId: z.string().uuid() });
const confirmBody = z.object({
  paymentIntentId: z.string().min(1),
  sessionId: z.string().uuid(),
});
const useCreditBody = z.object({ sessionId: z.string().uuid() });

/** The active session's city (for the city-room broadcast). */
async function sessionCity(sessionId: string, userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ city: string | null }>(
    `SELECT p.city FROM live_sessions ls JOIN profiles p ON p.id = ls.user_id
      WHERE ls.id = $1 AND ls.user_id = $2 AND ls.is_active = true AND ls.expires_at > NOW()`,
    [sessionId, userId],
  );
  if (rows.length === 0) return null;
  return (rows[0]!.city ?? 'Miami').toLowerCase();
}

async function activateBoost(params: {
  userId: string;
  sessionId: string;
  city: string;
  paymentIntentId?: string;
}): Promise<Date> {
  const boostEndsAt = new Date(Date.now() + BOOST_DURATION_MS);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO boosts (user_id, session_id, stripe_payment_intent_id, boost_start, boost_end, is_active)
     VALUES ($1, $2, $3, NOW(), $4, true) RETURNING id`,
    [params.userId, params.sessionId, params.paymentIntentId ?? null, boostEndsAt],
  );
  const boostId = rows[0]!.id;

  emitToUser(params.userId, 'boost:activated', {
    sessionId: params.sessionId,
    boostEndsAt: boostEndsAt.toISOString(),
  });
  emitToCity(params.city, 'map:pin:updated', { sessionId: params.sessionId, isBoosted: true });
  await scheduleBoostExpiry(boostId, params.sessionId, params.city);
  return boostEndsAt;
}

export async function boostRoutes(app: FastifyInstance): Promise<void> {
  // Pay-to-boost: create the PaymentIntent ($2.99). Max 1/hour.
  app.post(
    '/boost/purchase',
    { preHandler: authenticateToken, config: routeRateLimit(1, '60 minutes') },
    async (request, reply) => {
      const { sessionId } = purchaseBody.parse(request.body);
      const city = await sessionCity(sessionId, request.user.userId);
      if (!city) throw badRequest('You need an active live session to boost.');
      const { clientSecret } = await createBoostPaymentIntent(request.user.userId, sessionId);
      return reply.send({ clientSecret });
    },
  );

  // Confirm a paid boost.
  app.post('/boost/confirm', { preHandler: authenticateToken }, async (request, reply) => {
    const { paymentIntentId, sessionId } = confirmBody.parse(request.body);
    const { userId } = request.user;

    const intent = await retrievePaymentIntent(paymentIntentId);
    if (intent.status !== 'succeeded') throw badRequest('Payment has not completed.');

    const city = (await sessionCity(sessionId, userId)) ?? 'miami';
    const boostEndsAt = await activateBoost({ userId, sessionId, city, paymentIntentId });
    return reply.send({ success: true, boostEndsAt: boostEndsAt.toISOString() });
  });

  // Spend a VIP boost credit.
  app.post(
    '/boost/use-credit',
    { preHandler: [authenticateToken, requirePlan('vip')] },
    async (request, reply) => {
      const { sessionId } = useCreditBody.parse(request.body);
      const { userId } = request.user;

      const city = await sessionCity(sessionId, userId);
      if (!city) throw badRequest('You need an active live session to boost.');

      const creditsRemaining = await transaction(async (client) => {
        const credit = await client.query<{ boost_credits: number }>(
          'SELECT boost_credits FROM users WHERE id = $1 FOR UPDATE',
          [userId],
        );
        const credits = credit.rows[0]?.boost_credits ?? 0;
        if (credits <= 0) throw badRequest('No boost credits available.');
        await client.query('UPDATE users SET boost_credits = boost_credits - 1 WHERE id = $1', [
          userId,
        ]);
        return credits - 1;
      });

      const boostEndsAt = await activateBoost({ userId, sessionId, city });
      return reply.send({
        success: true,
        creditsRemaining,
        boostEndsAt: boostEndsAt.toISOString(),
      });
    },
  );

  // Credit + active-boost status.
  app.get('/boost/status', { preHandler: authenticateToken }, async (request, reply) => {
    const { userId } = request.user;
    const credits = await pool.query<{ boost_credits: number }>(
      'SELECT boost_credits FROM users WHERE id = $1',
      [userId],
    );
    const active = await pool.query<{ boost_end: Date }>(
      'SELECT boost_end FROM boosts WHERE user_id = $1 AND is_active = true AND boost_end > NOW() ORDER BY boost_end DESC LIMIT 1',
      [userId],
    );
    const count = credits.rows[0]?.boost_credits ?? 0;
    return reply.send({
      hasCreditAvailable: count > 0,
      credits: count,
      activeBoost: active.rows[0] ? { endsAt: active.rows[0].boost_end } : null,
    });
  });
}
