import type { FastifyInstance } from 'fastify';
import { pool } from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { requirePlan } from '../middleware/planCheck.js';

interface ViewerRow {
  spark_id: string;
  sender_id: string;
  display_name: string;
  age: number | null;
  emoji: string;
  trust: number;
  created_at: Date;
}

export async function sparkRoutes(app: FastifyInstance): Promise<void> {
  // Who sparked you — RIGHTNOW+ feature.
  app.get(
    '/sparks/who-viewed',
    { preHandler: [authenticateToken, requirePlan('plus')] },
    async (request, reply) => {
      const { rows } = await pool.query<ViewerRow>(
        `SELECT s.id AS spark_id, s.sender_id, s.created_at,
                p.display_name, p.age, p.avatar_emoji AS emoji,
                COALESCE(t.score, 50) AS trust
           FROM sparks s
           JOIN profiles p ON p.id = s.sender_id
           LEFT JOIN trust_scores t ON t.user_id = s.sender_id
          WHERE s.receiver_id = $1
          ORDER BY s.created_at DESC
          LIMIT 50`,
        [request.user.userId],
      );

      return reply.send({
        viewers: rows.map((r) => ({
          sparkId: r.spark_id,
          userId: r.sender_id,
          displayName: r.display_name,
          age: r.age === null ? null : Number(r.age),
          emoji: r.emoji,
          trustScore: Number(r.trust),
          at: new Date(r.created_at).toISOString(),
        })),
      });
    },
  );
}
