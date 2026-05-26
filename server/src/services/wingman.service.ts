import crypto from 'node:crypto';
import { pool } from '../db/index.js';
import { redis } from '../db/redis.js';
import { logger } from '../utils/logger.js';
import { badRequest, notFound } from '../utils/http-error.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const WINGMAN_LINK_BASE = 'https://rightnow.app/vouch';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7-day link
const TOKEN_REDIS_PREFIX = 'wingman_token:';
const MAX_VOUCHES_PER_USER = 10;

export const PERSONALITY_TAGS = [
  'adventurous', 'funny', 'loyal', 'creative', 'chill',
  'ambitious', 'spontaneous', 'kind', 'genuine', 'outdoorsy',
  'foodie', 'intellectual', 'social', 'romantic', 'reliable',
];

export interface WingmanVouch {
  id: string;
  voucherName: string;
  tags: string[];
  endorsement: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/** Generate a cryptographically secure 32-byte URL-safe token. */
export function generateWingmanToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** Store a token → userId mapping in Redis with TTL. */
export async function storeWingmanToken(userId: string): Promise<string> {
  const token = generateWingmanToken();
  await redis.set(`${TOKEN_REDIS_PREFIX}${token}`, userId, 'EX', TOKEN_TTL_SECONDS);
  return token;
}

/** Resolve a token to its userId, or throw if invalid/expired. */
export async function resolveWingmanToken(token: string): Promise<string> {
  const userId = await redis.get(`${TOKEN_REDIS_PREFIX}${token}`);
  if (!userId) throw badRequest('This wingman link has expired or is invalid.');
  return userId;
}

// ---------------------------------------------------------------------------
// Wingman link generation
// ---------------------------------------------------------------------------

export async function getWingmanLink(userId: string): Promise<{
  link: string;
  token: string;
  profile: { displayName: string; avatarEmoji: string; city: string };
}> {
  const { rows } = await pool.query<{
    display_name: string;
    avatar_emoji: string;
    city: string;
  }>('SELECT display_name, avatar_emoji, city FROM profiles WHERE id = $1', [userId]);

  if (!rows[0]) throw notFound('Profile not found.');

  const token = await storeWingmanToken(userId);
  return {
    link: `${WINGMAN_LINK_BASE}/${token}`,
    token,
    profile: {
      displayName: rows[0].display_name,
      avatarEmoji: rows[0].avatar_emoji,
      city: rows[0].city,
    },
  };
}

// ---------------------------------------------------------------------------
// Preview — called on the public vouch page (no auth needed)
// ---------------------------------------------------------------------------

export async function getWingmanPreview(token: string): Promise<{
  userId: string;
  displayName: string;
  avatarEmoji: string;
  city: string;
  existingVouchCount: number;
}> {
  const userId = await resolveWingmanToken(token);

  const { rows } = await pool.query<{
    display_name: string;
    avatar_emoji: string;
    city: string;
    vouch_count: string;
  }>(
    `SELECT p.display_name, p.avatar_emoji, p.city,
            (SELECT COUNT(*) FROM wingman_vouches wv WHERE wv.user_id = p.id) AS vouch_count
       FROM profiles p
      WHERE p.id = $1`,
    [userId],
  );
  if (!rows[0]) throw notFound('User not found.');

  return {
    userId,
    displayName: rows[0].display_name,
    avatarEmoji: rows[0].avatar_emoji,
    city: rows[0].city,
    existingVouchCount: Number(rows[0].vouch_count),
  };
}

// ---------------------------------------------------------------------------
// Submit a vouch (no auth — public endpoint)
// ---------------------------------------------------------------------------

export interface SubmitVouchInput {
  token: string;
  voucherName: string;
  tags: string[];
  endorsement?: string;
}

export async function submitVouch(input: SubmitVouchInput): Promise<{ id: string }> {
  const { token, voucherName, tags, endorsement } = input;

  // Validate
  const trimmedName = voucherName.trim().slice(0, 50);
  if (!trimmedName) throw badRequest('Your name is required.');
  if (!Array.isArray(tags) || tags.length !== 3) {
    throw badRequest('Please choose exactly 3 personality tags.');
  }
  const validTags = tags.filter((t) => PERSONALITY_TAGS.includes(t));
  if (validTags.length !== 3) throw badRequest('Invalid personality tags.');

  const trimmedEndorsement = endorsement?.trim().slice(0, 200) ?? null;

  // Resolve token
  const userId = await resolveWingmanToken(token);

  // Check cap
  const { rows: countRows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM wingman_vouches WHERE user_id = $1',
    [userId],
  );
  if (Number(countRows[0]?.count ?? 0) >= MAX_VOUCHES_PER_USER) {
    throw badRequest('This profile already has the maximum number of friend reviews.');
  }

  // Upsert (unique on user_id + lower(voucher_name))
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO wingman_vouches (user_id, voucher_name, tags, endorsement)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, LOWER(voucher_name))
       DO UPDATE SET tags = EXCLUDED.tags,
                     endorsement = EXCLUDED.endorsement,
                     created_at = NOW()
     RETURNING id`,
    [userId, trimmedName, validTags, trimmedEndorsement],
  );

  logger.info({ userId, voucherName: trimmedName }, 'wingman vouch submitted');
  return { id: rows[0]!.id };
}

// ---------------------------------------------------------------------------
// Get vouches for a user's profile (auth-protected — own profile only)
// ---------------------------------------------------------------------------

export async function getUserVouches(userId: string): Promise<WingmanVouch[]> {
  const { rows } = await pool.query<{
    id: string;
    voucher_name: string;
    tags: string[];
    endorsement: string | null;
    created_at: string;
  }>(
    `SELECT id, voucher_name, tags, endorsement, created_at
       FROM wingman_vouches
      WHERE user_id = $1 AND is_visible = true
      ORDER BY created_at DESC
      LIMIT ${MAX_VOUCHES_PER_USER}`,
    [userId],
  );

  return rows.map((r) => ({
    id: r.id,
    voucherName: r.voucher_name,
    tags: r.tags,
    endorsement: r.endorsement,
    createdAt: r.created_at,
  }));
}

/** Delete a vouch by ID (owner only). */
export async function deleteVouch(userId: string, vouchId: string): Promise<void> {
  const { rowCount } = await pool.query(
    'DELETE FROM wingman_vouches WHERE id = $1 AND user_id = $2',
    [vouchId, userId],
  );
  if (!rowCount) throw notFound('Vouch not found.');
}
