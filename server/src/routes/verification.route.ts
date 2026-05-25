import type { FastifyInstance } from 'fastify';
import type Stripe from 'stripe';
import { z } from 'zod';

import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { pool } from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { badRequest } from '../utils/http-error.js';
import { createIdentitySession, constructWebhookEvent } from '../services/stripe.service.js';
import { comparePhotos } from '../services/ai.service.js';
import { recalculateTrustScore } from '../services/trustScore.service.js';
import { emitToUser } from '../socket/emitter.js';

const photoMatchBody = z.object({ selfie: z.string().min(1) });

export async function verificationRoutes(app: FastifyInstance): Promise<void> {
  // Government ID via Stripe Identity.
  app.post('/verify/id', { preHandler: authenticateToken }, async (request, reply) => {
    const { userId } = request.user;
    const { clientSecret, url } = await createIdentitySession(userId, env.API_URL);
    return reply.send({ clientSecret, url });
  });

  // Selfie ↔ profile-photo match via OpenAI Vision.
  app.post('/verify/photo-match', { preHandler: authenticateToken }, async (request, reply) => {
    const { selfie } = photoMatchBody.parse(request.body);
    const { userId } = request.user;

    const { rows } = await pool.query<{ photo_url: string | null }>(
      'SELECT photo_url FROM profiles WHERE id = $1',
      [userId],
    );
    const photoUrl = rows[0]?.photo_url;
    if (!photoUrl) {
      throw badRequest('Add a profile photo before verifying a selfie match.');
    }

    const matched = await comparePhotos(selfie, photoUrl);
    if (matched) {
      await pool.query('UPDATE trust_scores SET photo_matched = true WHERE user_id = $1', [userId]);
      await recalculateTrustScore(userId);
    }
    return reply.send({ matched });
  });

  // Stripe webhook — needs the raw body for signature verification, so it runs
  // in its own encapsulated scope with a buffer body parser.
  await app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
      done(null, body);
    });

    scope.post('/verify/stripe-webhook', async (request, reply) => {
      const signature = request.headers['stripe-signature'];
      if (typeof signature !== 'string') {
        return reply.status(400).send({
          error: 'BadRequest',
          message: 'Missing Stripe signature',
          statusCode: 400,
        });
      }

      let event: Stripe.Event;
      try {
        event = constructWebhookEvent(request.body as Buffer, signature);
      } catch (err) {
        logger.warn({ err }, 'Stripe webhook signature verification failed');
        return reply.status(400).send({
          error: 'BadRequest',
          message: 'Invalid signature',
          statusCode: 400,
        });
      }

      if (event.type === 'identity.verification_session.verified') {
        const session = event.data.object as Stripe.Identity.VerificationSession;
        const userId = session.metadata?.userId;
        if (userId) {
          await pool.query('UPDATE trust_scores SET verified_id = true WHERE user_id = $1', [
            userId,
          ]);
          await pool.query("UPDATE users SET verification_tier = 'id_verified' WHERE id = $1", [
            userId,
          ]);
          await recalculateTrustScore(userId);
          emitToUser(userId, 'verification:complete', { type: 'id' });
        }
      }

      return reply.send({ received: true });
    });
  });
}
