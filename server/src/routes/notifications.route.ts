import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { pool } from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';

// A Web Push subscription — require an endpoint, keep the rest as-is.
const subscribeBody = z.object({
  subscription: z.object({ endpoint: z.string().url() }).passthrough(),
});

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/notifications/subscribe',
    { preHandler: authenticateToken },
    async (request, reply) => {
      const { subscription } = subscribeBody.parse(request.body);
      const { userId } = request.user;
      const endpoint = subscription.endpoint as string;

      // Replace any existing record for this device endpoint.
      await pool.query(
        "DELETE FROM user_push_subscriptions WHERE user_id = $1 AND subscription->>'endpoint' = $2",
        [userId, endpoint],
      );
      await pool.query(
        'INSERT INTO user_push_subscriptions (user_id, subscription) VALUES ($1, $2)',
        [userId, subscription],
      );

      return reply.send({ success: true });
    },
  );
}
