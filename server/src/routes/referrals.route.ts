import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { authenticateToken } from '../middleware/auth.js';
import { getReferralStats, trackReferral } from '../services/referrals.service.js';

const trackBody = z.object({ referralCode: z.string().min(1) });

export async function referralRoutes(app: FastifyInstance): Promise<void> {
  app.get('/referrals/stats', { preHandler: authenticateToken }, async (request, reply) => {
    return reply.send(await getReferralStats(request.user.userId));
  });

  app.post('/referrals/track', { preHandler: authenticateToken }, async (request, reply) => {
    const { referralCode } = trackBody.parse(request.body);
    return reply.send(await trackReferral(request.user.userId, referralCode));
  });
}
