import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.route.js';
import { authRoutes } from './auth.route.js';

/**
 * Registers all HTTP routes. Feature routers (sessions, matches, chat) are
 * mounted here under the /api prefix as they are built out.
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Unprefixed infra + auth endpoints.
  await app.register(healthRoutes);
  await app.register(authRoutes);

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
