import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { pool, closeDatabase } from '../db/index.js';
import { closeRedis, redis } from '../db/redis.js';
import { computeProfileCompletion, bustCompletionCache } from '../services/profileCompletion.service.js';

const USER_A = 'e4440001-0000-4000-8000-000000000001';
const ALL    = [USER_A];

async function seed(overrides?: {
  photoUrl?: string;
  bio?: string;
  voiceNoteUrl?: string;
  vibes?: string[];
  verifiedPhone?: boolean;
  photoVerified?: boolean;
}): Promise<void> {
  await pool.query(
    'INSERT INTO users (id, phone, is_verified) VALUES ($1, $2, true) ON CONFLICT (id) DO NOTHING',
    [USER_A, '+13055559601'],
  );
  await pool.query(
    `INSERT INTO profiles (id, display_name, age, city, photo_url, bio, voice_note_url, preferred_vibes)
     VALUES ($1, 'CompUser', 25, 'Miami', $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       photo_url = $2, bio = $3, voice_note_url = $4, preferred_vibes = $5`,
    [
      USER_A,
      overrides?.photoUrl ?? null,
      overrides?.bio ?? null,
      overrides?.voiceNoteUrl ?? null,
      overrides?.vibes ?? null,
    ],
  );
  await pool.query(
    `INSERT INTO trust_scores (user_id, score, verified_phone, photo_verified)
     VALUES ($1, 60, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET verified_phone = $2, photo_verified = $3`,
    [USER_A, overrides?.verifiedPhone ?? false, overrides?.photoVerified ?? false],
  );
  // Clear cache so we get fresh results
  await bustCompletionCache(USER_A);
}

beforeEach(async () => {
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ALL]);
  await seed();
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ALL]);
  await closeDatabase();
  await closeRedis();
});

describe('computeProfileCompletion()', () => {
  it('returns 0 for a bare-minimum profile', async () => {
    const result = await computeProfileCompletion(USER_A);
    expect(result.score).toBe(0);
    expect(result.breakdown.photo).toBe(false);
    expect(result.breakdown.bio).toBe(false);
    expect(result.breakdown.voice).toBe(false);
    expect(result.breakdown.vibes).toBe(false);
    expect(result.breakdown.verified).toBe(false);
    expect(result.breakdown.wingman).toBe(false);
  });

  it('awards +25 for a profile photo', async () => {
    await seed({ photoUrl: 'https://cdn.example.com/photo.jpg' });
    const result = await computeProfileCompletion(USER_A);
    expect(result.breakdown.photo).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(25);
  });

  it('awards +15 for a bio of more than 10 characters', async () => {
    await seed({ bio: 'I love going out on Friday nights' });
    const result = await computeProfileCompletion(USER_A);
    expect(result.breakdown.bio).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(15);
  });

  it('does not award bio points for short bio (≤10 chars)', async () => {
    await seed({ bio: 'Hi' });
    const result = await computeProfileCompletion(USER_A);
    expect(result.breakdown.bio).toBe(false);
  });

  it('awards +15 for a voice note URL', async () => {
    await seed({ voiceNoteUrl: 'https://cdn.example.com/voice.mp3' });
    const result = await computeProfileCompletion(USER_A);
    expect(result.breakdown.voice).toBe(true);
  });

  it('awards +15 for 2+ preferred vibes', async () => {
    await seed({ vibes: ['drinks', 'food'] });
    const result = await computeProfileCompletion(USER_A);
    expect(result.breakdown.vibes).toBe(true);
  });

  it('does not award vibes points for fewer than 2 vibes', async () => {
    await seed({ vibes: ['drinks'] });
    const result = await computeProfileCompletion(USER_A);
    expect(result.breakdown.vibes).toBe(false);
  });

  it('awards +20 for phone + photo verified', async () => {
    await seed({ verifiedPhone: true, photoVerified: true });
    const result = await computeProfileCompletion(USER_A);
    expect(result.breakdown.verified).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(20);
  });

  it('does not award verified points if only phone verified', async () => {
    await seed({ verifiedPhone: true, photoVerified: false });
    const result = await computeProfileCompletion(USER_A);
    expect(result.breakdown.verified).toBe(false);
  });

  it('returns a nextAction when profile is incomplete', async () => {
    const result = await computeProfileCompletion(USER_A);
    expect(result.nextAction).not.toBeNull();
    expect(result.nextAction!.points).toBeGreaterThan(0);
    expect(result.nextAction!.route).toMatch(/^\/[a-z]/);
  });

  it('returns null nextAction for a 100% complete profile', async () => {
    // Set up a near-complete profile
    await seed({
      photoUrl:      'https://cdn.example.com/photo.jpg',
      bio:           'Active nightlife person who loves spontaneous evenings',
      voiceNoteUrl:  'https://cdn.example.com/voice.mp3',
      vibes:         ['drinks', 'food', 'late'],
      verifiedPhone: true,
      photoVerified: true,
    });
    // Add a wingman vouch
    await pool.query(
      "INSERT INTO trust_scores (user_id, score, verified_phone, photo_verified) VALUES ($1, 90, true, true) ON CONFLICT (user_id) DO UPDATE SET photo_verified = true",
      [USER_A],
    );
    await pool.query(
      "INSERT INTO wingman_vouches (user_id, voucher_name, tags) VALUES ($1, 'Alex', ARRAY['funny','kind','adventurous']) ON CONFLICT (user_id, LOWER(voucher_name)) DO NOTHING",
      [USER_A],
    );
    await bustCompletionCache(USER_A);
    const result = await computeProfileCompletion(USER_A);
    expect(result.score).toBe(100);
    expect(result.nextAction).toBeNull();
  });

  it('caches results in Redis', async () => {
    await computeProfileCompletion(USER_A);
    const cached = await redis.get(`profile:completion:${USER_A}`);
    expect(cached).not.toBeNull();
    const parsed = JSON.parse(cached!);
    expect(parsed.score).toBeDefined();
  });

  it('bustCompletionCache removes the cached value', async () => {
    await computeProfileCompletion(USER_A); // prime cache
    await bustCompletionCache(USER_A);
    const cached = await redis.get(`profile:completion:${USER_A}`);
    expect(cached).toBeNull();
  });
});
