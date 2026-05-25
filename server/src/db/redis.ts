import { Redis } from 'ioredis';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';

/**
 * Primary Redis client (commands). Use `redis.duplicate()` for the
 * blocking/subscriber connections required by Socket.io's Redis adapter.
 */
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => logger.error({ err }, 'Redis error'));
redis.on('connect', () => logger.info('Connected to Redis'));

export async function verifyRedis(): Promise<void> {
  if (redis.status === 'wait') {
    await redis.connect();
  }
  await redis.ping();
}

export async function closeRedis(): Promise<void> {
  redis.disconnect();
}
