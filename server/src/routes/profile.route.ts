import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { pool } from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { notFound } from '../utils/http-error.js';

const patchBody = z.object({
  displayName: z.string().min(1).max(30).optional(),
  age: z.number().int().min(18).max(99).optional(),
  avatar_emoji: z.string().min(1).max(10).optional(),
  bio: z.string().max(500).optional(),
  vibe: z.enum(['coffee', 'drinks', 'walk', 'food', 'explore', 'late', 'spicy']).optional(),
});

interface ProfileRow {
  id: string;
  display_name: string;
  age: number | null;
  avatar_emoji: string;
  bio: string | null;
  city: string;
  preferred_vibes: string[] | null;
  trust_score: number;
}

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.get('/profile', { preHandler: authenticateToken }, async (request, reply) => {
    const { rows } = await pool.query(
      `SELECT p.id, p.display_name, p.age, p.avatar_emoji, p.bio, p.city, p.preferred_vibes,
              COALESCE(t.score, 50) AS trust_score,
              COALESCE(t.total_dates, 0) AS total_dates,
              COALESCE(t.average_rating, 0) AS average_rating,
              COALESCE(t.show_up_rate, 1) AS show_up_rate,
              COALESCE(t.verified_id, false) AS verified_id
         FROM profiles p
         LEFT JOIN trust_scores t ON t.user_id = p.id
        WHERE p.id = $1`,
      [request.user.userId],
    );
    if (rows.length === 0) throw notFound('Profile not found.');
    return reply.send(rows[0]);
  });

  app.patch('/profile', { preHandler: authenticateToken }, async (request, reply) => {
    const body = patchBody.parse(request.body);
    const { userId } = request.user;
    const vibes = body.vibe ? [body.vibe] : null;

    const { rows } = await pool.query<ProfileRow>(
      `UPDATE profiles SET
         display_name    = COALESCE($2, display_name),
         age             = COALESCE($3, age),
         avatar_emoji    = COALESCE($4, avatar_emoji),
         bio             = COALESCE($5, bio),
         preferred_vibes = COALESCE($6, preferred_vibes)
       WHERE id = $1
       RETURNING id, display_name, age, avatar_emoji, bio, city, preferred_vibes`,
      [
        userId,
        body.displayName ?? null,
        body.age ?? null,
        body.avatar_emoji ?? null,
        body.bio ?? null,
        vibes,
      ],
    );
    if (rows.length === 0) throw notFound('Profile not found.');
    return reply.send(rows[0]);
  });
}
