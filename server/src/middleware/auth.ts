import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Requires a valid JWT. Verifies the Authorization: Bearer token via the
 * @fastify/jwt plugin (registered in app.ts) and populates `request.user`
 * with { userId, phone }. Responds 401 when the token is missing or invalid.
 */
export async function authenticateToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    await reply.status(401).send({
      error: 'Unauthorized',
      message: 'A valid access token is required',
      statusCode: 401,
    });
  }
}

/**
 * Like authenticateToken, but never rejects: if a valid token is present
 * `request.user` is populated, otherwise the request continues anonymously.
 */
export async function optionalAuth(request: FastifyRequest): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    // No/invalid token — proceed unauthenticated.
  }
}

// Backwards-compatible alias.
export const requireAuth = authenticateToken;
