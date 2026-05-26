import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { pool } from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { forbidden, notFound } from '../utils/http-error.js';
import { generateIcebreaker, generateThreeIcebreakers, scoreProfileBio } from '../services/ai.service.js';
import { routeRateLimit } from '../middleware/rateLimit.js';

const icebreakerBody = z.object({ matchId: z.string().uuid() });
const scoreBody = z.object({ bio: z.string().min(1).max(500) });

async function assertParticipant(matchId: string, userId: string): Promise<void> {
  const { rows } = await pool.query<{ user1_id: string; user2_id: string }>(
    'SELECT user1_id, user2_id FROM matches WHERE id = $1',
    [matchId],
  );
  if (rows.length === 0) throw notFound('Match not found.');
  if (userId !== rows[0]!.user1_id && userId !== rows[0]!.user2_id) {
    throw forbidden('You are not part of this match.');
  }
}

// AI endpoints: 20 requests/min.
const aiRouteOpts = {
  preHandler: authenticateToken,
  config: routeRateLimit(20, '1 minute'),
};

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  app.post('/ai/icebreaker', aiRouteOpts, async (request, reply) => {
    const { matchId } = icebreakerBody.parse(request.body);
    await assertParticipant(matchId, request.user.userId);
    return reply.send({ icebreaker: await generateIcebreaker(matchId) });
  });

  // GET variant retained for existing clients (Match/Meetup screens).
  app.get('/ai/icebreaker', aiRouteOpts, async (request, reply) => {
    const { matchId } = icebreakerBody.parse(request.query);
    await assertParticipant(matchId, request.user.userId);
    return reply.send({ icebreaker: await generateIcebreaker(matchId) });
  });

  app.post('/ai/profile-score', aiRouteOpts, async (request, reply) => {
    const { bio } = scoreBody.parse(request.body);
    return reply.send(await scoreProfileBio(bio));
  });

  // Three icebreakers for the chat bubble UI
  app.get('/ai/icebreakers/three', aiRouteOpts, async (request, reply) => {
    const { matchId } = icebreakerBody.parse(request.query);
    await assertParticipant(matchId, request.user.userId);
    return reply.send({ icebreakers: await generateThreeIcebreakers(matchId) });
  });
}
