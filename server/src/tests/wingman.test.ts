import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { pool, closeDatabase } from '../db/index.js';
import { redis, closeRedis } from '../db/redis.js';
import {
  generateWingmanToken,
  storeWingmanToken,
  resolveWingmanToken,
  submitVouch,
  getUserVouches,
  deleteVouch,
  PERSONALITY_TAGS,
} from '../services/wingman.service.js';

const USER_A = 'c2220001-0000-4000-8000-000000000001';
const USER_B = 'c2220002-0000-4000-8000-000000000002';
const ALL    = [USER_A, USER_B];

async function seed(): Promise<void> {
  for (const [id, phone] of [[USER_A, '+13055559801'], [USER_B, '+13055559802']] as const) {
    await pool.query(
      'INSERT INTO users (id, phone, is_verified) VALUES ($1, $2, true) ON CONFLICT (id) DO NOTHING',
      [id, phone],
    );
    await pool.query(
      "INSERT INTO profiles (id, display_name, age, city, avatar_emoji) VALUES ($1, 'WM_User', 25, 'Miami', '🧑') ON CONFLICT (id) DO NOTHING",
      [id],
    );
    await pool.query(
      "INSERT INTO trust_scores (user_id, score) VALUES ($1, 70) ON CONFLICT (user_id) DO NOTHING",
      [id],
    );
  }
}

beforeEach(async () => {
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ALL]);
  await seed();
  await pool.query('DELETE FROM wingman_vouches WHERE user_id = ANY($1)', [ALL]);
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ALL]);
  await closeDatabase();
  await closeRedis();
});

describe('generateWingmanToken()', () => {
  it('returns a base64url string of 32 bytes (43 chars)', () => {
    const token = generateWingmanToken();
    expect(token).toHaveLength(43);
    expect(/^[A-Za-z0-9_-]+$/.test(token)).toBe(true);
  });

  it('generates unique tokens on each call', () => {
    const a = generateWingmanToken();
    const b = generateWingmanToken();
    expect(a).not.toBe(b);
  });
});

describe('storeWingmanToken() + resolveWingmanToken()', () => {
  it('stores and resolves a token to the correct userId', async () => {
    const token  = await storeWingmanToken(USER_A);
    const userId = await resolveWingmanToken(token);
    expect(userId).toBe(USER_A);
  });

  it('throws on an invalid / expired token', async () => {
    await expect(resolveWingmanToken('invalid-token-xyz')).rejects.toThrow();
  });
});

describe('submitVouch()', () => {
  it('creates a vouch with valid input', async () => {
    const token = await storeWingmanToken(USER_A);
    const tags  = PERSONALITY_TAGS.slice(0, 3);

    const result = await submitVouch({
      token,
      voucherName: 'Alex',
      tags,
      endorsement: 'Super fun to be around!',
    });
    expect(result.id).toBeDefined();

    const vouches = await getUserVouches(USER_A);
    expect(vouches).toHaveLength(1);
    expect(vouches[0]!.voucherName).toBe('Alex');
    expect(vouches[0]!.tags).toEqual(expect.arrayContaining(tags));
    expect(vouches[0]!.endorsement).toBe('Super fun to be around!');
  });

  it('rejects when fewer than 3 tags are provided', async () => {
    const token = await storeWingmanToken(USER_A);
    await expect(
      submitVouch({ token, voucherName: 'Sam', tags: ['funny', 'kind'] }),
    ).rejects.toThrow();
  });

  it('rejects invalid personality tags', async () => {
    const token = await storeWingmanToken(USER_A);
    await expect(
      submitVouch({ token, voucherName: 'Sam', tags: ['invalid_tag_xyz', 'funny', 'kind'] }),
    ).rejects.toThrow();
  });

  it('rejects with expired token', async () => {
    await expect(
      submitVouch({
        token: 'expired-or-invalid-token',
        voucherName: 'Jay',
        tags: PERSONALITY_TAGS.slice(0, 3),
      }),
    ).rejects.toThrow();
  });

  it('deduplicates — second vouch from same voucher name updates', async () => {
    const token = await storeWingmanToken(USER_A);
    const tags  = PERSONALITY_TAGS.slice(0, 3);
    await submitVouch({ token, voucherName: 'Alex', tags });

    const token2 = await storeWingmanToken(USER_A);
    await submitVouch({ token: token2, voucherName: 'Alex', tags, endorsement: 'Updated!' });

    const vouches = await getUserVouches(USER_A);
    expect(vouches).toHaveLength(1);
    expect(vouches[0]!.endorsement).toBe('Updated!');
  });
});

describe('getUserVouches()', () => {
  it('returns empty array for user with no vouches', async () => {
    const vouches = await getUserVouches(USER_A);
    expect(vouches).toEqual([]);
  });
});

describe('deleteVouch()', () => {
  it('removes a vouch by ID', async () => {
    const token = await storeWingmanToken(USER_A);
    const { id } = await submitVouch({
      token,
      voucherName: 'Jordan',
      tags: PERSONALITY_TAGS.slice(0, 3),
    });
    await deleteVouch(USER_A, id);
    const vouches = await getUserVouches(USER_A);
    expect(vouches).toHaveLength(0);
  });

  it('throws when vouch does not belong to the user', async () => {
    const token = await storeWingmanToken(USER_A);
    const { id } = await submitVouch({
      token,
      voucherName: 'Taylor',
      tags: PERSONALITY_TAGS.slice(0, 3),
    });
    await expect(deleteVouch(USER_B, id)).rejects.toThrow();
  });
});

describe('PERSONALITY_TAGS', () => {
  it('contains at least 12 valid tags', () => {
    expect(PERSONALITY_TAGS.length).toBeGreaterThanOrEqual(12);
  });

  it('contains no duplicates', () => {
    const unique = new Set(PERSONALITY_TAGS);
    expect(unique.size).toBe(PERSONALITY_TAGS.length);
  });
});
