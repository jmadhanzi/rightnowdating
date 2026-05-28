import { pool } from '../db/index.js';
import { redis } from '../db/redis.js';

// ---------------------------------------------------------------------------
// Scoring weights — total = 100
// ---------------------------------------------------------------------------
const WEIGHTS = {
  photo:    25, // has profile photo
  bio:      15, // has bio text
  voice:    15, // has voice note
  vibes:    15, // has at least 2 preferred vibes selected
  verified: 20, // phone + photo verified (10 each)
  wingman:  10, // has at least 1 wingman vouch
} as const;

export interface CompletionScore {
  score: number;               // 0–100
  breakdown: {
    photo:    boolean;
    bio:      boolean;
    voice:    boolean;
    vibes:    boolean;
    verified: boolean;
    wingman:  boolean;
  };
  nextAction: {
    label:    string;
    route:    string;
    impact:   string;
    points:   number;
  } | null;
}

// ---------------------------------------------------------------------------
// Compute profile completion
// ---------------------------------------------------------------------------
export async function computeProfileCompletion(userId: string): Promise<CompletionScore> {
  const cacheKey = `profile:completion:${userId}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached) as CompletionScore;

  const { rows } = await pool.query<{
    photo_url:     string | null;
    bio:           string | null;
    voice_note_url: string | null;
    preferred_vibes: string[];
    verified_phone: boolean;
    photo_verified: boolean;
    vouch_count:   string;
  }>(
    `SELECT p.photo_url, p.bio, p.voice_note_url, p.preferred_vibes,
            ts.verified_phone, COALESCE(ts.photo_verified, false) AS photo_verified,
            (SELECT COUNT(*)::text FROM wingman_vouches wv WHERE wv.user_id = p.id) AS vouch_count
       FROM profiles p
       JOIN trust_scores ts ON ts.user_id = p.id
      WHERE p.id = $1`,
    [userId],
  );

  if (!rows[0]) {
    return { score: 0, breakdown: { photo: false, bio: false, voice: false, vibes: false, verified: false, wingman: false }, nextAction: null };
  }

  const r = rows[0];
  const breakdown = {
    photo:    !!r.photo_url,
    bio:      !!(r.bio && r.bio.length > 10),
    voice:    !!r.voice_note_url,
    vibes:    Array.isArray(r.preferred_vibes) && r.preferred_vibes.length >= 2,
    verified: r.verified_phone && r.photo_verified,
    wingman:  Number(r.vouch_count) >= 1,
  };

  let score = 0;
  if (breakdown.photo)    score += WEIGHTS.photo;
  if (breakdown.bio)      score += WEIGHTS.bio;
  if (breakdown.voice)    score += WEIGHTS.voice;
  if (breakdown.vibes)    score += WEIGHTS.vibes;
  if (breakdown.verified) score += WEIGHTS.verified;
  if (breakdown.wingman)  score += WEIGHTS.wingman;

  const nextAction = getNextAction(breakdown, r.verified_phone);

  // Upsert into DB for analytics
  await pool.query(
    `INSERT INTO profile_completion (user_id, score, has_photo, has_bio, has_voice, has_vibes, has_verified, has_wingman)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (user_id) DO UPDATE SET
       score=$2, has_photo=$3, has_bio=$4, has_voice=$5,
       has_vibes=$6, has_verified=$7, has_wingman=$8, updated_at=NOW()`,
    [userId, score, breakdown.photo, breakdown.bio, breakdown.voice, breakdown.vibes, breakdown.verified, breakdown.wingman],
  );

  const result: CompletionScore = { score, breakdown, nextAction };
  await redis.set(cacheKey, JSON.stringify(result), 'EX', 300).catch(() => undefined); // 5min cache
  return result;
}

/** Bust the cache when a profile is updated. */
export async function bustCompletionCache(userId: string): Promise<void> {
  await redis.del(`profile:completion:${userId}`).catch(() => undefined);
}

/** Return the highest-impact next action to complete. */
function getNextAction(
  b: CompletionScore['breakdown'],
  verifiedPhone: boolean,
): CompletionScore['nextAction'] {
  if (!b.verified && !verifiedPhone) {
    return { label: 'Verify your phone', route: '/profile', impact: 'Verified users get 3× more sparks', points: 20 };
  }
  if (!b.photo) {
    return { label: 'Add a profile photo', route: '/profile', impact: '+25 points · Profile photo = 40% more matches', points: 25 };
  }
  if (!b.voice) {
    return { label: 'Record a voice note', route: '/profile', impact: '+15 points · Voice notes reduce catfish by 90%', points: 15 };
  }
  if (!b.wingman) {
    return { label: 'Get a wingman vouch', route: '/wingman', impact: '+10 points · Vouched profiles get priority visibility', points: 10 };
  }
  if (!b.bio) {
    return { label: 'Write a short bio', route: '/profile', impact: '+15 points · Bios spark better conversations', points: 15 };
  }
  if (!b.vibes) {
    return { label: 'Pick your vibes', route: '/profile', impact: '+15 points · Vibes drive better matches', points: 15 };
  }
  return null; // 100% complete
}
