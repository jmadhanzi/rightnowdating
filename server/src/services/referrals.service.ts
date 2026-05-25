import crypto from 'node:crypto';
import { pool } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { badRequest } from '../utils/http-error.js';
import { setUserPlan, type Plan } from './plan.service.js';
import {
  isStripeConfigured,
  getOrCreateCustomer,
  createTrialSubscription,
} from './stripe.service.js';
import { notifyReward } from './push.service.js';

// Unambiguous alphabet (no 0/O/1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

const REFERRAL_LINK_BASE = 'https://rightnow.app/join';
export const referralLink = (code: string): string => `${REFERRAL_LINK_BASE}/${code}`;

export interface ReferralTier {
  tier: number;
  friends: number;
  reward: string;
}

export const REFERRAL_TIERS: ReferralTier[] = [
  { tier: 1, friends: 1, reward: '1 Free Boost Credit' },
  { tier: 2, friends: 2, reward: '2 Free Boost Credits' },
  { tier: 3, friends: 3, reward: '1 Week RIGHTNOW+ Free' },
  { tier: 4, friends: 5, reward: '1 Month VIP Free' },
  { tier: 5, friends: 10, reward: '1 Year VIP Free' },
];

export function generateReferralCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return code;
}

/** Generate a referral code guaranteed unique against the users table. */
export async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateReferralCode();
    const { rows } = await pool.query('SELECT 1 FROM users WHERE referral_code = $1', [code]);
    if (rows.length === 0) return code;
  }
  throw new Error('Could not generate a unique referral code');
}

/** Ensure a user has a referral code, generating one if missing. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const { rows } = await pool.query<{ referral_code: string | null }>(
    'SELECT referral_code FROM users WHERE id = $1',
    [userId],
  );
  if (rows[0]?.referral_code) return rows[0].referral_code;
  const code = await generateUniqueReferralCode();
  await pool.query('UPDATE users SET referral_code = $1 WHERE id = $2', [code, userId]);
  return code;
}

/**
 * Record that `referredUserId` arrived via `referralCode`. No-op if they
 * already have a referral record.
 */
export async function trackReferral(
  referredUserId: string,
  referralCode: string,
): Promise<{ tracked: boolean }> {
  const referrer = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE referral_code = $1',
    [referralCode],
  );
  if (referrer.rows.length === 0) throw badRequest('Invalid referral code.');
  const referrerId = referrer.rows[0]!.id;
  if (referrerId === referredUserId) throw badRequest('You cannot refer yourself.');

  const result = await pool.query(
    `INSERT INTO referrals (referrer_id, referred_id, referral_code, status)
     VALUES ($1, $2, $3, 'clicked')
     ON CONFLICT (referred_id) DO NOTHING`,
    [referrerId, referredUserId, referralCode],
  );
  return { tracked: (result.rowCount ?? 0) > 0 };
}

// ---------------------------------------------------------------------------
// Reward processing
// ---------------------------------------------------------------------------
const REWARD_THRESHOLDS = [1, 2, 3, 5, 10] as const;

async function grantTrialReward(userId: string, plan: Plan, trialDays: number): Promise<void> {
  const trialEnds = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

  let stripeCustomerId: string | null = null;
  let stripeSubscriptionId: string | null = null;
  if (isStripeConfigured()) {
    try {
      const userRes = await pool.query<{ phone: string }>('SELECT phone FROM users WHERE id = $1', [
        userId,
      ]);
      stripeCustomerId = await getOrCreateCustomer(userId, userRes.rows[0]?.phone);
      const sub = await createTrialSubscription({
        customerId: stripeCustomerId,
        userId,
        plan,
        period: 'monthly',
        trialDays,
      });
      stripeSubscriptionId = sub.id;
    } catch (err) {
      logger.warn({ err, userId, plan }, 'Stripe trial grant failed; granting locally');
    }
  }

  await pool.query(
    `INSERT INTO subscriptions
       (user_id, plan, billing_period, status, trial_ends_at, current_period_end,
        stripe_customer_id, stripe_subscription_id)
     VALUES ($1, $2, 'monthly', 'trialing', $3, $3, $4, $5)`,
    [userId, plan, trialEnds, stripeCustomerId, stripeSubscriptionId],
  );
  await setUserPlan(userId, plan);
}

async function applyReward(userId: string, threshold: number): Promise<void> {
  if (threshold === 1 || threshold === 2) {
    await pool.query('UPDATE users SET boost_credits = boost_credits + 1 WHERE id = $1', [userId]);
  } else if (threshold === 3) {
    await grantTrialReward(userId, 'plus', 7);
  } else if (threshold === 5) {
    await grantTrialReward(userId, 'vip', 30);
  } else if (threshold === 10) {
    await grantTrialReward(userId, 'vip', 365);
  }
}

/**
 * Grant any newly-earned referral rewards to `referrerId` based on their count
 * of completed (first_date) referrals. Each tier is granted at most once.
 */
export async function processReferralReward(referrerId: string): Promise<number> {
  const countRes = await pool.query<{ c: number }>(
    "SELECT COUNT(*)::int AS c FROM referrals WHERE referrer_id = $1 AND status = 'first_date'",
    [referrerId],
  );
  const count = countRes.rows[0]?.c ?? 0;

  for (const threshold of REWARD_THRESHOLDS) {
    if (count < threshold) break;
    const tier = REFERRAL_TIERS.find((t) => t.friends === threshold)!;

    // Ledger insert grants the tier exactly once.
    const claim = await pool.query(
      `INSERT INTO referral_rewards (user_id, tier_count, reward)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, tier_count) DO NOTHING
       RETURNING id`,
      [referrerId, threshold, tier.reward],
    );
    if (claim.rows.length === 0) continue; // already granted

    await applyReward(referrerId, threshold);
    await notifyReward(referrerId, { tier: tier.tier, reward: tier.reward });
  }

  return count;
}

/**
 * Mark a referred user's first date complete and trigger reward processing for
 * their referrer.
 */
export async function recordReferredFirstDate(referredUserId: string): Promise<void> {
  const updated = await pool.query<{ referrer_id: string }>(
    "UPDATE referrals SET status = 'first_date' WHERE referred_id = $1 AND status <> 'first_date' RETURNING referrer_id",
    [referredUserId],
  );
  if (updated.rows.length === 0) return;
  await processReferralReward(updated.rows[0]!.referrer_id);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export interface ReferralStats {
  referralCode: string;
  referralLink: string;
  totalReferred: number;
  totalCompletedDates: number;
  currentTier: { name: string; reward: string; friendsNeeded: number; friendsAway: number };
  tiers: { tier: number; friends: number; reward: string; unlocked: boolean }[];
  cityLeaderboard: { rank: number; userId: string; displayName: string; count: number }[];
  userRank: number;
}

export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const referralCode = await ensureReferralCode(userId);

  const totals = await pool.query<{ total: number; completed: number }>(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'first_date')::int AS completed
       FROM referrals WHERE referrer_id = $1`,
    [userId],
  );
  const totalReferred = totals.rows[0]?.total ?? 0;
  const totalCompletedDates = totals.rows[0]?.completed ?? 0;

  const tiers = REFERRAL_TIERS.map((t) => ({
    tier: t.tier,
    friends: t.friends,
    reward: t.reward,
    unlocked: totalCompletedDates >= t.friends,
  }));

  const next = REFERRAL_TIERS.find((t) => totalCompletedDates < t.friends);
  const currentTier = next
    ? {
        name: `Tier ${next.tier}`,
        reward: next.reward,
        friendsNeeded: next.friends,
        friendsAway: next.friends - totalCompletedDates,
      }
    : { name: 'Max Tier', reward: 'All rewards unlocked', friendsNeeded: 0, friendsAway: 0 };

  const cityRes = await pool.query<{ city: string | null }>(
    'SELECT city FROM profiles WHERE id = $1',
    [userId],
  );
  const city = (cityRes.rows[0]?.city ?? 'Miami').toLowerCase();

  const leaderboardRes = await pool.query<{
    id: string;
    display_name: string;
    cnt: number;
    rank: number;
  }>(
    `WITH ranked AS (
       SELECT p.id, p.display_name,
              COUNT(r.id)::int AS cnt,
              ROW_NUMBER() OVER (ORDER BY COUNT(r.id) DESC)::int AS rank
         FROM profiles p
         JOIN referrals r ON r.referrer_id = p.id AND r.status = 'first_date'
        WHERE LOWER(p.city) = $1
        GROUP BY p.id, p.display_name
     )
     SELECT * FROM ranked`,
    [city],
  );

  const cityLeaderboard = leaderboardRes.rows.slice(0, 10).map((row) => ({
    rank: Number(row.rank),
    userId: row.id,
    displayName: row.display_name,
    count: Number(row.cnt),
  }));
  const userRank = leaderboardRes.rows.find((row) => row.id === userId)?.rank ?? 0;

  return {
    referralCode,
    referralLink: referralLink(referralCode),
    totalReferred,
    totalCompletedDates,
    currentTier,
    tiers,
    cityLeaderboard,
    userRank: Number(userRank),
  };
}
