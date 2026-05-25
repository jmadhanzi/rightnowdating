import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { pool } from '../db/index.js';
import { redis } from '../db/redis.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePlan } from '../middleware/planCheck.js';
import { getUserPlan, planRank } from '../services/plan.service.js';
import { applyFuzzyLocation } from '../services/location.service.js';
import { emitToCity } from '../socket/emitter.js';

// Free users may start up to this many live sessions per day; the 3rd+ needs Plus.
const FREE_DAILY_LIVE_LIMIT = 2;

const createBody = z.object({
  vibe: z.enum(['coffee', 'drinks', 'walk', 'food', 'explore', 'late', 'spicy']),
  windowMinutes: z.union([z.literal(30), z.literal(60), z.literal(120)]),
  latitude: z.number(),
  longitude: z.number(),
  radiusMiles: z.number().positive().max(50).default(2),
});

const invisibleBody = z.object({ enabled: z.boolean() });

export async function liveRoutes(app: FastifyInstance): Promise<void> {
  app.post('/live/create', { preHandler: authenticateToken }, async (request, reply) => {
    const body = createBody.parse(request.body);
    const { userId } = request.user;

    // Daily quota gate: the 3rd+ live session in a day requires Plus.
    // Count today's sessions using UTC date so the quota is consistent regardless
    // of where the server is deployed.
    const todayRes = await pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c
         FROM live_sessions
        WHERE user_id = $1
          AND (created_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date`,
      [userId],
    );
    const todayCount = todayRes.rows[0]?.c ?? 0;
    if (todayCount >= FREE_DAILY_LIVE_LIMIT) {
      const plan = await getUserPlan(userId);
      if (planRank(plan) < planRank('plus')) {
        return reply.status(403).send({
          upgradeRequired: true,
          currentPlan: plan,
          requiredPlan: 'plus',
          message: 'Upgrade to RIGHTNOW+ to go live more than twice a day.',
        });
      }
    }

    const cityRes = await pool.query<{ city: string | null }>(
      'SELECT city FROM profiles WHERE id = $1',
      [userId],
    );
    const city = (cityRes.rows[0]?.city ?? 'Miami').toLowerCase();

    const { fuzzyLat, fuzzyLng } = applyFuzzyLocation(body.latitude, body.longitude);
    const expiresAt = new Date(Date.now() + body.windowMinutes * 60_000);

    // Deactivate any pre-existing session to prevent duplicate live pins.
    const existingSessionId = await redis.get(`user_session:${userId}`);
    if (existingSessionId) {
      await pool.query(
        'UPDATE live_sessions SET is_active = false WHERE id = $1 AND is_active = true',
        [existingSessionId],
      );
      await redis.srem(`live_sessions:${city}`, existingSessionId);
      emitToCity(city, 'map:pin:removed', { sessionId: existingSessionId });
    }

    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO live_sessions
         (user_id, location, fuzzy_location, vibe, window_minutes, expires_at, is_active, radius_miles)
       VALUES ($1,
               ST_SetSRID(ST_MakePoint($2, $3), 4326),
               ST_SetSRID(ST_MakePoint($2, $3), 4326),
               $4, $5, $6, true, $7)
       RETURNING id`,
      [userId, fuzzyLng, fuzzyLat, body.vibe, body.windowMinutes, expiresAt, body.radiusMiles],
    );
    const sessionId = inserted.rows[0]!.id;

    await redis.set(`user_session:${userId}`, sessionId, 'EX', body.windowMinutes * 60);
    await redis.sadd(`live_sessions:${city}`, sessionId);

    const trustRes = await pool.query<{ score: number }>(
      'SELECT score FROM trust_scores WHERE user_id = $1',
      [userId],
    );
    const trustScore = trustRes.rows[0] ? Number(trustRes.rows[0].score) : 50;

    emitToCity(city, 'map:pin:added', {
      sessionId,
      fuzzyLat,
      fuzzyLng,
      vibe: body.vibe,
      trustScore,
    });

    return reply.send({ sessionId, fuzzyLat, fuzzyLng, expiresAt: expiresAt.toISOString() });
  });

  // Invisible mode — VIP only.
  app.post(
    '/live/invisible-mode',
    { preHandler: [authenticateToken, requirePlan('vip')] },
    async (request, reply) => {
      const { enabled } = invisibleBody.parse(request.body);
      const key = `invisible:${request.user.userId}`;
      if (enabled) await redis.set(key, '1');
      else await redis.del(key);
      return reply.send({ invisible: enabled });
    },
  );
}
