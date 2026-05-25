import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { pool } from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { forbidden, notFound } from '../utils/http-error.js';

const MATCH_WINDOW_MS = 7 * 60 * 1000;
const params = z.object({ matchId: z.string().uuid() });

interface MatchRow {
  id: string;
  status: string;
  meetup_time: Date | null;
  created_at: Date;
  spark_id: string | null;
  venue_id: string | null;
  user1_id: string;
  user2_id: string;
}

export async function matchRoutes(app: FastifyInstance): Promise<void> {
  app.get('/matches/:matchId', { preHandler: authenticateToken }, async (request, reply) => {
    const { matchId } = params.parse(request.params);
    const { userId } = request.user;

    const matchRes = await pool.query<MatchRow>(
      `SELECT id, status, meetup_time, created_at, spark_id, venue_id, user1_id, user2_id
         FROM matches WHERE id = $1`,
      [matchId],
    );
    const match = matchRes.rows[0];
    if (!match) throw notFound('Match not found.');
    if (userId !== match.user1_id && userId !== match.user2_id) {
      throw forbidden('You are not part of this match.');
    }

    const otherId = userId === match.user1_id ? match.user2_id : match.user1_id;

    const otherRes = await pool.query<{
      display_name: string;
      age: number | null;
      avatar_emoji: string;
      preferred_vibes: string[] | null;
      score: number;
      verified_id: boolean;
    }>(
      `SELECT p.display_name, p.age, p.avatar_emoji, p.preferred_vibes,
              COALESCE(t.score, 50) AS score, COALESCE(t.verified_id, false) AS verified_id
         FROM profiles p
         LEFT JOIN trust_scores t ON t.user_id = p.id
        WHERE p.id = $1`,
      [otherId],
    );
    const other = otherRes.rows[0];

    let venue: {
      id: string;
      name: string;
      address: string;
      lat: number;
      lng: number;
      isSafeZone: boolean;
    } | null = null;
    if (match.venue_id) {
      const v = await pool.query<{
        id: string;
        name: string;
        address: string;
        lat: number;
        lng: number;
        is_safe_zone: boolean;
      }>(
        `SELECT id, name, address, ST_Y(location) AS lat, ST_X(location) AS lng, is_safe_zone
           FROM venues WHERE id = $1`,
        [match.venue_id],
      );
      const row = v.rows[0];
      if (row) {
        venue = {
          id: row.id,
          name: row.name,
          address: row.address,
          lat: Number(row.lat),
          lng: Number(row.lng),
          isSafeZone: row.is_safe_zone,
        };
      }
    }

    let distanceMiles = 0;
    if (match.spark_id) {
      const d = await pool.query<{ dist: number | null }>(
        `SELECT ST_Distance(s1.fuzzy_location::geography, s2.fuzzy_location::geography) AS dist
           FROM sparks sp
           JOIN live_sessions s1 ON s1.id = sp.sender_session_id
           JOIN live_sessions s2 ON s2.id = sp.receiver_session_id
          WHERE sp.id = $1`,
        [match.spark_id],
      );
      const meters = d.rows[0]?.dist;
      if (meters != null) distanceMiles = Number(meters) / 1609.34;
    }

    const vibe = (other?.preferred_vibes?.[0] as string | undefined) ?? 'drinks';
    const trustScore = other ? Number(other.score) : 50;

    return reply.send({
      matchId: match.id,
      status: match.status,
      sparkId: match.spark_id,
      createdAt: match.created_at,
      meetupTime: match.meetup_time,
      expiresAt: new Date(new Date(match.created_at).getTime() + MATCH_WINDOW_MS).toISOString(),
      distanceMiles: Math.round(distanceMiles * 10) / 10,
      other: {
        userId: otherId,
        displayName: other?.display_name ?? 'Someone',
        age: other?.age ?? null,
        emoji: other?.avatar_emoji ?? '🧑',
        vibe,
        trustScore,
        verified: Boolean(other?.verified_id) || trustScore >= 66,
        interests: (other?.preferred_vibes ?? []).slice(1, 3),
      },
      venue,
    });
  });
}
