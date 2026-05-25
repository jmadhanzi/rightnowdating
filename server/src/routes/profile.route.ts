import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { pool } from '../db/index.js';
import { redis } from '../db/redis.js';
import { authenticateToken } from '../middleware/auth.js';
import { notFound } from '../utils/http-error.js';

const PROFILE_CACHE_TTL = 300; // 5 minutes
const profileCacheKey = (userId: string): string => `profile:${userId}`;

const VIBE_VALUES = ['coffee', 'drinks', 'walk', 'food', 'explore', 'late', 'spicy'] as const;
const patchBody = z
  .object({
    displayName: z.string().min(1).max(30).optional(),
    age: z.number().int().min(18).max(99).optional(),
    avatar_emoji: z.string().min(1).max(10).optional(),
    bio: z.string().max(500).optional(),
    vibe: z.enum(VIBE_VALUES).optional(),
    vibes: z.array(z.enum(VIBE_VALUES)).max(7).optional(),
    city: z.string().min(1).max(50).optional(),
    preferred_radius_miles: z.number().positive().max(50).optional(),
    preferred_age_min: z.number().int().min(18).max(99).optional(),
    preferred_age_max: z.number().int().min(18).max(99).optional(),
  })
  .refine(
    (d) =>
      d.preferred_age_min === undefined ||
      d.preferred_age_max === undefined ||
      d.preferred_age_min <= d.preferred_age_max,
    { message: 'preferred_age_min must be ≤ preferred_age_max', path: ['preferred_age_min'] },
  );

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
    const cacheKey = profileCacheKey(request.user.userId);
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return reply.send(JSON.parse(cached));

    const { rows } = await pool.query(
      `SELECT p.id, p.display_name, p.age, p.avatar_emoji, p.bio, p.city, p.preferred_vibes,
              p.preferred_radius_miles, p.preferred_age_min, p.preferred_age_max,
              COALESCE(t.score, 50) AS trust_score,
              COALESCE(t.total_dates, 0) AS total_dates,
              COALESCE(t.average_rating, 0) AS average_rating,
              COALESCE(t.show_up_rate, 1) AS show_up_rate,
              COALESCE(t.verified_id, false) AS verified_id,
              COALESCE(t.verified_phone, false) AS verified_phone,
              COALESCE(t.photo_matched, false) AS photo_matched
         FROM profiles p
         LEFT JOIN trust_scores t ON t.user_id = p.id
        WHERE p.id = $1`,
      [request.user.userId],
    );
    if (rows.length === 0) throw notFound('Profile not found.');
    await redis
      .set(cacheKey, JSON.stringify(rows[0]), 'EX', PROFILE_CACHE_TTL)
      .catch(() => undefined);
    return reply.send(rows[0]);
  });

  app.patch('/profile', { preHandler: authenticateToken }, async (request, reply) => {
    const body = patchBody.parse(request.body);
    const { userId } = request.user;
    const vibes = body.vibes ?? (body.vibe ? [body.vibe] : null);

    const { rows } = await pool.query<ProfileRow>(
      `UPDATE profiles SET
         display_name           = COALESCE($2, display_name),
         age                    = COALESCE($3, age),
         avatar_emoji           = COALESCE($4, avatar_emoji),
         bio                    = COALESCE($5, bio),
         preferred_vibes        = COALESCE($6, preferred_vibes),
         city                   = COALESCE($7, city),
         preferred_radius_miles = COALESCE($8, preferred_radius_miles),
         preferred_age_min      = COALESCE($9, preferred_age_min),
         preferred_age_max      = COALESCE($10, preferred_age_max)
       WHERE id = $1
       RETURNING id, display_name, age, avatar_emoji, bio, city, preferred_vibes,
                 preferred_radius_miles, preferred_age_min, preferred_age_max`,
      [
        userId,
        body.displayName ?? null,
        body.age ?? null,
        body.avatar_emoji ?? null,
        body.bio ?? null,
        vibes,
        body.city ?? null,
        body.preferred_radius_miles ?? null,
        body.preferred_age_min ?? null,
        body.preferred_age_max ?? null,
      ],
    );
    if (rows.length === 0) throw notFound('Profile not found.');
    await redis.del(profileCacheKey(userId)).catch(() => undefined);
    return reply.send(rows[0]);
  });
}
