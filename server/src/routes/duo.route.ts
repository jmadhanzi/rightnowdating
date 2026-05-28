import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { authenticateToken } from '../middleware/auth.js';
import { routeRateLimit } from '../middleware/rateLimit.js';
import {
  inviteDuo,
  acceptDuo,
  endDuo,
  getMyDuo,
  searchUsersForDuo,
  createOpenNight,
  getNearbyOpenNights,
  requestJoinOpenNight,
  respondToJoinRequest,
} from '../services/duo.service.js';

const inviteBody = z.object({ partnerId: z.string().uuid() });
const acceptBody = z.object({ duoId: z.string().uuid() });
const endBody    = z.object({ duoId: z.string().uuid() });
const searchQuery = z.object({ q: z.string().min(2).max(40) });

const createNightBody = z.object({
  duoId:           z.string().uuid().optional(),
  venueName:       z.string().min(1).max(120),
  venueId:         z.string().uuid().optional(),
  headline:        z.string().min(1).max(100),
  vibe:            z.string().min(1).max(40).default('drinks'),
  capacity:        z.number().int().min(2).max(10).default(4),
  latitude:        z.number().optional(),
  longitude:       z.number().optional(),
  durationMinutes: z.number().int().min(30).max(360).default(120),
});

const nearbyNightsQuery = z.object({
  lat:         z.coerce.number(),
  lng:         z.coerce.number(),
  radiusMiles: z.coerce.number().default(5),
});

const joinRequestBody = z.object({
  openNightId: z.string().uuid(),
  duoId:       z.string().uuid().optional(),
  message:     z.string().max(200).optional(),
});

const respondBody = z.object({
  requestId: z.string().uuid(),
  accept:    z.boolean(),
});

const authOpts = { preHandler: authenticateToken };

export async function duoRoutes(app: FastifyInstance): Promise<void> {
  // ── Duo management ──────────────────────────────────────────────────────
  app.get('/duo/me', authOpts, async (req, reply) => {
    return reply.send(await getMyDuo(req.user.userId));
  });

  app.get('/duo/search', authOpts, async (req, reply) => {
    const { q } = searchQuery.parse(req.query);
    return reply.send({ users: await searchUsersForDuo(q, req.user.userId) });
  });

  app.post(
    '/duo/invite',
    { ...authOpts, config: routeRateLimit(10, '1 hour') },
    async (req, reply) => {
      const { partnerId } = inviteBody.parse(req.body);
      return reply.status(201).send(await inviteDuo(req.user.userId, partnerId));
    },
  );

  app.post('/duo/accept', authOpts, async (req, reply) => {
    const { duoId } = acceptBody.parse(req.body);
    await acceptDuo(duoId, req.user.userId);
    return reply.send({ accepted: true });
  });

  app.post('/duo/end', authOpts, async (req, reply) => {
    const { duoId } = endBody.parse(req.body);
    await endDuo(duoId, req.user.userId);
    return reply.send({ ended: true });
  });

  // ── Open Nights ──────────────────────────────────────────────────────────
  app.post(
    '/open-nights',
    { ...authOpts, config: routeRateLimit(5, '1 hour') },
    async (req, reply) => {
      const body = createNightBody.parse(req.body);
      return reply.status(201).send(
        await createOpenNight({ hostUserId: req.user.userId, ...body }),
      );
    },
  );

  app.get('/open-nights/nearby', authOpts, async (req, reply) => {
    const { lat, lng, radiusMiles } = nearbyNightsQuery.parse(req.query);
    return reply.send({ nights: await getNearbyOpenNights({ latitude: lat, longitude: lng, radiusMiles }) });
  });

  app.post(
    '/open-nights/request',
    { ...authOpts, config: routeRateLimit(20, '1 hour') },
    async (req, reply) => {
      const body = joinRequestBody.parse(req.body);
      return reply.status(201).send(
        await requestJoinOpenNight({ requesterId: req.user.userId, ...body }),
      );
    },
  );

  app.post('/open-nights/respond', authOpts, async (req, reply) => {
    const body = respondBody.parse(req.body);
    await respondToJoinRequest({ hostUserId: req.user.userId, ...body });
    return reply.send({ done: true });
  });
}
