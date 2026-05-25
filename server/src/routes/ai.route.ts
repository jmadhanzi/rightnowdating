import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { pool } from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { forbidden, notFound } from '../utils/http-error.js';
import { generateIcebreaker } from '../services/openai.service.js';

const query = z.object({ matchId: z.string().uuid() });

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ai/icebreaker', { preHandler: authenticateToken }, async (request, reply) => {
    const { matchId } = query.parse(request.query);
    const { userId } = request.user;

    const matchRes = await pool.query<{ user1_id: string; user2_id: string }>(
      'SELECT user1_id, user2_id FROM matches WHERE id = $1',
      [matchId],
    );
    const match = matchRes.rows[0];
    if (!match) throw notFound('Match not found.');
    if (userId !== match.user1_id && userId !== match.user2_id) {
      throw forbidden('You are not part of this match.');
    }
    const otherId = userId === match.user1_id ? match.user2_id : match.user1_id;

    const vibes = await pool.query<{
      id: string;
      display_name: string;
      preferred_vibes: string[] | null;
    }>('SELECT id, display_name, preferred_vibes FROM profiles WHERE id = ANY($1)', [
      [userId, otherId],
    ]);
    const me = vibes.rows.find((r) => r.id === userId);
    const them = vibes.rows.find((r) => r.id === otherId);

    const icebreaker = await generateIcebreaker({
      myVibe: me?.preferred_vibes?.[0],
      theirVibe: them?.preferred_vibes?.[0],
      theirName: them?.display_name,
    });

    return reply.send({ icebreaker });
  });
}
