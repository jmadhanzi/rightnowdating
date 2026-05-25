import { env } from '../utils/env.js';

/**
 * Per-route rate-limit config. Disabled under NODE_ENV=test so the suite can
 * make many requests from one IP without tripping limits.
 */
export function routeRateLimit(
  max: number,
  timeWindow: string,
): { rateLimit: { max: number; timeWindow: string } | false } {
  return env.NODE_ENV === 'test' ? { rateLimit: false } : { rateLimit: { max, timeWindow } };
}
