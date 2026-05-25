import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';

import { env } from './utils/env.js';
import { loggerOptions } from './utils/logger.js';
import { registerRoutes } from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { redis } from './db/redis.js';

/**
 * Build a fully-configured Fastify instance (security plugins, CORS, JWT,
 * Redis-backed rate limiting, routes) WITHOUT starting the HTTP listener or
 * connecting Socket.io. Used by both the server entry point and the test suite.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions,
    trustProxy: true,
    // Never leak internals; our error handler shapes all responses.
    disableRequestLogging: env.NODE_ENV === 'test',
  });

  app.setErrorHandler(errorHandler);

  // Security headers on every response.
  await app.register(helmet, { contentSecurityPolicy: false });

  // CORS locked to the configured web client origin(s).
  await app.register(cors, {
    origin: env.CLIENT_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  });

  // Global rate limit, backed by Redis so limits hold across instances.
  await app.register(rateLimit, {
    max: env.NODE_ENV === 'test' ? 1_000_000 : 100,
    timeWindow: '1 minute',
    redis,
    // If Redis is unavailable, fail open rather than blocking all traffic.
    skipOnError: true,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_EXPIRES_IN },
  });

  await registerRoutes(app);

  return app;
}
