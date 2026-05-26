import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { authenticateToken } from '../middleware/auth.js';
import { routeRateLimit } from '../middleware/rateLimit.js';
import {
  getWingmanLink,
  getWingmanPreview,
  submitVouch,
  getUserVouches,
  deleteVouch,
  PERSONALITY_TAGS,
} from '../services/wingman.service.js';

const submitVouchBody = z.object({
  token:       z.string().min(10),
  voucherName: z.string().min(1).max(50),
  tags:        z.array(z.string()).length(3),
  endorsement: z.string().max(200).optional(),
});

const deleteVouchParams = z.object({ vouchId: z.string().uuid() });

export async function wingmanRoutes(app: FastifyInstance): Promise<void> {
  // ── Authenticated: generate my wingman link ─────────────────────────────
  app.get(
    '/wingman/link',
    { preHandler: authenticateToken, config: routeRateLimit(10, '1 minute') },
    async (request, reply) => {
      return reply.send(await getWingmanLink(request.user.userId));
    },
  );

  // ── Authenticated: get my own vouches ───────────────────────────────────
  app.get(
    '/wingman/vouches',
    { preHandler: authenticateToken },
    async (request, reply) => {
      return reply.send({ vouches: await getUserVouches(request.user.userId) });
    },
  );

  // ── Authenticated: delete one of my vouches ─────────────────────────────
  app.delete(
    '/wingman/vouches/:vouchId',
    { preHandler: authenticateToken },
    async (request, reply) => {
      const { vouchId } = deleteVouchParams.parse(request.params);
      await deleteVouch(request.user.userId, vouchId);
      return reply.send({ deleted: true });
    },
  );

  // ── Public: preview the profile before vouching (no auth needed) ────────
  app.get(
    '/wingman/preview/:token',
    { config: routeRateLimit(30, '1 minute') },
    async (request, reply) => {
      const { token } = z.object({ token: z.string() }).parse(request.params);
      return reply.send(await getWingmanPreview(token));
    },
  );

  // ── Public: submit a vouch (no auth needed) ─────────────────────────────
  app.post(
    '/wingman/vouch',
    { config: routeRateLimit(5, '1 minute') },
    async (request, reply) => {
      const body = submitVouchBody.parse(request.body);
      return reply.send(await submitVouch(body));
    },
  );

  // ── Public: list available personality tags ─────────────────────────────
  app.get('/wingman/tags', async (_request, reply) => {
    return reply.send({ tags: PERSONALITY_TAGS });
  });
}
