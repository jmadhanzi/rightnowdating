import { env } from './utils/env.js';
import { buildApp } from './app.js';
import { createSocketServer } from './socket/index.js';
import { verifyDatabase, closeDatabase } from './db/index.js';
import { verifyRedis, closeRedis } from './db/redis.js';

async function start(): Promise<void> {
  const app = await buildApp();

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
