import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.route.js';
import { authRoutes } from './auth.route.js';
import { verificationRoutes } from './verification.route.js';
import { safetyRoutes } from './safety.route.js';
import { referralRoutes } from './referrals.route.js';
import { paymentRoutes } from './payments.route.js';
import { sparkRoutes } from './sparks.route.js';
import { liveRoutes } from './live.route.js';
import { boostRoutes } from './boost.route.js';

/**
 * Registers all HTTP routes. Feature routers (sessions, matches, chat) are
 * mounted here under the /api prefix as they are built out.
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

  // Versioned application API.
  await app.register(
    async (api) => {
      api.get('/', async () => ({ name: 'RIGHTNOW API', version: 'v1' }));
      // await api.register(sessionRoutes);
      // await api.register(matchRoutes);
    },
    { prefix: '/api/v1' },
  );
}
