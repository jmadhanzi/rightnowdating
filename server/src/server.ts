import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';

import { env } from './utils/env.js';
import { loggerOptions } from './utils/logger.js';
import { registerRoutes } from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { createSocketServer } from './socket/index.js';
import { verifyDatabase, closeDatabase } from './db/index.js';
import { verifyRedis, closeRedis } from './db/redis.js';

async function buildServer() {
  const app = Fastify({
    logger: loggerOptions,
    trustProxy: true,
  });

  app.setErrorHandler(errorHandler);

  // Security & platform plugins
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env.CLIENT_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_EXPIRES_IN },
  });

  await registerRoutes(app);

  return app;
}

async function start(): Promise<void> {
  const app = await buildServer();

  // Best-effort infra checks — warn (don't crash) so /health stays available
  // even before Postgres/Redis are up locally.
  await verifyDatabase().catch((err) => app.log.warn({ err }, 'Postgres not reachable at boot'));
  await verifyRedis().catch((err) => app.log.warn({ err }, 'Redis not reachable at boot'));

  // Attach Socket.io to Fastify's underlying HTTP server.
  const io = createSocketServer(app.server);

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`RIGHTNOW API listening on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error({ err }, 'Failed to start server');
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutting down...');
    io.close();
    await app.close();
    await closeDatabase().catch(() => undefined);
    await closeRedis().catch(() => undefined);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void start();
