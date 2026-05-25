import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { pool } from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { forbidden, notFound } from '../utils/http-error.js';

const params = z.object({ matchId: z.string().uuid() });

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  // Conversation list.
  app.get('/chats', { preHandler: authenticateToken }, async (request, reply) => {
    const { userId } = request.user;
    const { rows } = await pool.query<{
      match_id: string;
      status: string;
      meetup_time: Date | null;
      partner_id: string;
      display_name: string;
      avatar_emoji: string;
      trust: number;
      last_content: string | null;
      last_at: Date | null;
    }>(
      `SELECT m.id AS match_id, m.status, m.meetup_time,
              o.pid AS partner_id, p.display_name, p.avatar_emoji,
              COALESCE(t.score, 50) AS trust,
              lm.content AS last_content, lm.created_at AS last_at
         FROM matches m
         JOIN LATERAL (SELECT CASE WHEN m.user1_id = $1 THEN m.user2_id ELSE m.user1_id END AS pid) o ON true
         JOIN profiles p ON p.id = o.pid
         LEFT JOIN trust_scores t ON t.user_id = o.pid
         LEFT JOIN LATERAL (
           SELECT content, created_at FROM messages
            WHERE match_id = m.id AND deleted_at IS NULL
            ORDER BY created_at DESC LIMIT 1
         ) lm ON true
        WHERE (m.user1_id = $1 OR m.user2_id = $1) AND m.status IN ('active', 'met')
        ORDER BY COALESCE(lm.created_at, m.created_at) DESC`,
      [userId],
    );

    return reply.send({
      conversations: rows.map((r) => ({
        matchId: r.match_id,
        status: r.status,
        isActive: r.status === 'active',
        meetupTime: r.meetup_time,
        partner: {
          userId: r.partner_id,
          displayName: r.display_name,
          emoji: r.avatar_emoji,
          trustScore: Number(r.trust),
        },
        lastMessage: r.last_content ? { content: r.last_content, createdAt: r.last_at } : null,
      })),
    });
  });

  // Message history for a match.
  app.get('/chats/:matchId/messages', { preHandler: authenticateToken }, async (request, reply) => {
    const { matchId } = params.parse(request.params);
    const { userId } = request.user;

    const m = await pool.query<{ user1_id: string; user2_id: string }>(
      'SELECT user1_id, user2_id FROM matches WHERE id = $1',
      [matchId],
    );
    if (m.rows.length === 0) throw notFound('Match not found.');
    if (userId !== m.rows[0]!.user1_id && userId !== m.rows[0]!.user2_id) {
      throw forbidden('You are not part of this match.');
    }

    const { rows } = await pool.query<{
      id: string;
      sender_id: string;
      content: string;
      is_flagged: boolean;
      created_at: Date;
    }>(
      `SELECT id, sender_id, content, is_flagged, created_at
         FROM messages
        WHERE match_id = $1 AND deleted_at IS NULL
        ORDER BY created_at ASC LIMIT 200`,
      [matchId],
    );

    return reply.send({
      messages: rows.map((r) => ({
        id: r.id,
        matchId,
        senderId: r.sender_id,
        content: r.content,
        isFlagged: r.is_flagged,
        createdAt: r.created_at,
      })),
    });
  });
}
