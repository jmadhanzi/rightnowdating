import { pool } from '../db/index.js';
import { redis } from '../db/redis.js';

export type Plan = 'free' | 'plus' | 'vip';

const PLAN_RANK: Record<Plan, number> = { free: 0, plus: 1, vip: 2 };
const PLAN_TTL_SECONDS = 3600;
const planKey = (userId: string): string => `plan:${userId}`;

export function planRank(plan: Plan): number {
  return PLAN_RANK[plan] ?? 0;
}

/** Cache a user's plan for fast middleware checks. */
export async function setUserPlan(userId: string, plan: Plan): Promise<void> {
  await redis.set(planKey(userId), plan, 'EX', PLAN_TTL_SECONDS);
}

export async function clearUserPlan(userId: string): Promise<void> {
  await redis.del(planKey(userId));
}

/**
 * Resolve a user's current plan: Redis cache first, then the most recent
 * active/trialing subscription, defaulting to 'free'. Result is cached.
 */
export async function getUserPlan(userId: string): Promise<Plan> {
  const cached = await redis.get(planKey(userId));
  if (cached === 'free' || cached === 'plus' || cached === 'vip') return cached;

  const { rows } = await pool.query<{ plan: Plan }>(
    `SELECT plan FROM subscriptions
      WHERE user_id = $1 AND status IN ('active', 'trialing', 'cancelling')
      ORDER BY current_period_end DESC NULLS LAST
      LIMIT 1`,
    [userId],
  );
  const plan: Plan = rows[0]?.plan ?? 'free';
  await setUserPlan(userId, plan);
  return plan;
}
