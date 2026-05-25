import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Route preHandler that requires a valid JWT. Relies on the @fastify/jwt
 * plugin registered in server.ts. On success, `request.user` is populated
 * with the decoded payload.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({
      error: 'Unauthorized',
      message: 'A valid access token is required',
      statusCode: 401,
    });
  }
}
