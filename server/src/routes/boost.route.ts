import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { transaction } from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePlan } from '../middleware/planCheck.js';
import { badRequest } from '../utils/http-error.js';
import { emitToUser } from '../socket/emitter.js';

const BOOST_DURATION_MS = 60 * 60 * 1000;

const useCreditBody = z.object({ sessionId: z.string().uuid() });

export async function boostRoutes(app: FastifyInstance): Promise<void> {
  // Spend a boost credit instead of paying — VIP perk.
  app.post(
    '/boost/use-credit',
    { preHandler: [authenticateToken, requirePlan('vip')] },
    async (request, reply) => {
      const { sessionId } = useCreditBody.parse(request.body);
      const { userId } = request.user;
      const boostEndsAt = new Date(Date.now() + BOOST_DURATION_MS);

      const remaining = await transaction(async (client) => {
        const credit = await client.query<{ boost_credits: number }>(
          'SELECT boost_credits FROM users WHERE id = $1 FOR UPDATE',
          [userId],
        );
        const credits = credit.rows[0]?.boost_credits ?? 0;
        if (credits <= 0) {
          throw badRequest('No boost credits available.');
        }
        await client.query('UPDATE users SET boost_credits = boost_credits - 1 WHERE id = $1', [
          userId,
        ]);
        await client.query(
          `INSERT INTO boosts (user_id, session_id, boost_start, boost_end, is_active)
           VALUES ($1, $2, NOW(), $3, true)`,
          [userId, sessionId, boostEndsAt],
        );
        return credits - 1;
      });

      emitToUser(userId, 'boost:activated', {
        sessionId,
        boostEndsAt: boostEndsAt.toISOString(),
      });
      return reply.send({
        success: true,
        boostEndsAt: boostEndsAt.toISOString(),
        creditsRemaining: remaining,
      });
    },
  );
}
