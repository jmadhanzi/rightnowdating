import type { FastifyReply, FastifyRequest } from 'fastify';
import type { HealthResponse } from '@rightnow/shared';

/**
 * Liveness/readiness probe. Returns a minimal status payload so load
 * balancers and uptime monitors can confirm the service is responsive.
 */
export async function getHealth(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<HealthResponse> {
  const body: HealthResponse = {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
  return reply.status(200).send(body);
}
