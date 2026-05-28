import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.route.js';
import { authRoutes } from './auth.route.js';
import { verificationRoutes } from './verification.route.js';
import { safetyRoutes } from './safety.route.js';
import { referralRoutes } from './referrals.route.js';
import { paymentRoutes } from './payments.route.js';
import { sparkRoutes } from './sparks.route.js';
import { liveRoutes } from './live.route.js';
import { boostRoutes } from './boosts.route.js';
import { profileRoutes } from './profile.route.js';
import { notificationRoutes } from './notifications.route.js';
import { matchRoutes } from './matches.route.js';
import { aiRoutes } from './ai.route.js';
import { chatRoutes } from './chats.route.js';
import { wingmanRoutes } from './wingman.route.js';
import { duoRoutes } from './duo.route.js';
import { growthRoutes } from './growth.route.js';

/**
 * Registers all HTTP routes. Feature routers are mounted here; the versioned
 * /api/v1 prefix is reserved for future additions.
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Unprefixed infra + auth endpoints.
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(verificationRoutes);
  await app.register(safetyRoutes);
  await app.register(referralRoutes);
  await app.register(paymentRoutes);
  await app.register(sparkRoutes);
  await app.register(liveRoutes);
  await app.register(boostRoutes);
  await app.register(profileRoutes);
  await app.register(notificationRoutes);
  await app.register(matchRoutes);
  await app.register(aiRoutes);
  await app.register(chatRoutes);
  await app.register(wingmanRoutes);
  await app.register(duoRoutes);
  await app.register(growthRoutes);

  // Versioned application API (reserved).
  await app.register(
    async (api) => {
      api.get('/', async () => ({ name: 'RIGHTNOW API', version: 'v1' }));
    },
    { prefix: '/api/v1' },
  );
}
