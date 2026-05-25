import type { FastifyInstance } from 'fastify';
import { getHealth } from '../controllers/health.controller.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // GET /health -> { status: 'ok', ... }
  app.get('/health', getHealth);
}
