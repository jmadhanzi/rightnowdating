import { pool } from '../db/index.js';
import { emitToUser } from '../socket/emitter.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export interface MapVisibility {
  /** Percentage of nearby users who should see this pin. */
  percent: number;
  /** Whether the pin gets priority placement. */
  priority: boolean;
}

/** Map a trust score to pin visibility per the visibility rules. */
export function visibilityForScore(score: number): MapVisibility {
  if (score <= 40) return { percent: 25, priority: false };
  if (score <= 65) return { percent: 60, priority: false };
  if (score <= 80) return { percent: 85, priority: false };
  return { percent: 100, priority: true };
}

interface ScoreInputs {
  verified_phone: boolean;
  verified_id: boolean;
  photo_matched: boolean;
  show_up_rate: number;
  average_rating: number;
}

/**
 * Compute a 0–100 trust score from verification, behaviour, tenure, and
 * deductions, then persist it. Returns the saved score.
 */
export async function calculateTrustScore(userId: string): Promise<number> {
  const tsRes = await pool.query<ScoreInputs>(
    `SELECT verified_phone, verified_id, photo_matched, show_up_rate, average_rating
       FROM trust_scores WHERE user_id = $1`,
    [userId],
  );
  const userRes = await pool.query<{ created_at: Date; is_banned: boolean }>(
    'SELECT created_at, is_banned FROM users WHERE id = $1',
    [userId],
  );
  const reportsRes = await pool.query<{ c: number }>(
    'SELECT COUNT(*)::int AS c FROM reports WHERE reported_user_id = $1',
    [userId],
  );
  const concernsRes = await pool.query<{ c: number }>(
    'SELECT COUNT(*)::int AS c FROM date_ratings WHERE ratee_id = $1 AND safety_concern = true',
    [userId],
  );

  const ts = tsRes.rows[0];
  const user = userRes.rows[0];
  const reportCount = reportsRes.rows[0]?.c ?? 0;
  const concernCount = concernsRes.rows[0]?.c ?? 0;

  let score = 0;

  // --- Positive signals ---
  if (ts?.verified_phone) score += 20;
  if (ts?.verified_id) score += 25;
  if (ts?.photo_matched) score += 10;

  const showUpRate = clamp(Number(ts?.show_up_rate ?? 0), 0, 1);
  score += showUpRate * 25;

  const avgRating = Number(ts?.average_rating ?? 0);
  if (avgRating > 0) score += clamp(avgRating, 1, 5) * 3; // 1★→3, 5★→15

  if (user?.created_at) {
    const weeks = (Date.now() - new Date(user.created_at).getTime()) / WEEK_MS;
    score += Math.min(weeks, 10) * 0.5; // up to 5
  }

  // --- Deductions ---
  score -= reportCount * 5;
  score -= concernCount * 10;
  if (user?.is_banned) score -= 20;

  const finalScore = clamp(Math.round(score), 0, 100);

  await pool.query(
    `INSERT INTO trust_scores (user_id, score, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET score = EXCLUDED.score, updated_at = NOW()`,
    [userId, finalScore],
  );

  return finalScore;
}

/** Recompute, persist, and push the new score to the user over the socket. */
export async function recalculateTrustScore(userId: string): Promise<number> {
  const score = await calculateTrustScore(userId);
  emitToUser(userId, 'trust:updated', { score });
  return score;
}
