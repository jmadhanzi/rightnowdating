import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { pool, closeDatabase } from '../db/index.js';
import { closeRedis } from '../db/redis.js';
import { calculateTrustScore } from '../services/trustScore.service.js';

const U = 'f2220001-0000-4000-8000-000000000001';
const REPORTER = 'f2220002-0000-4000-8000-000000000002';
const ALL = [U, REPORTER];

interface TrustFields {
  vp: boolean;
  vid: boolean;
  pm: boolean;
  sur: number;
  ar: number;
}

async function seed(ts: TrustFields, weeksOld = 0, banned = false): Promise<void> {
  await pool.query(
    `INSERT INTO users (id, phone, is_verified, is_banned, created_at)
     VALUES ($1, '+13055550000', true, $2, NOW() - ($3 || ' weeks')::interval)`,
    [U, banned, String(weeksOld)],
  );
  await pool.query(
    `INSERT INTO profiles (id, display_name, age, city) VALUES ($1, 'T', 28, 'Miami')`,
    [U],
  );
  await pool.query(
    `INSERT INTO trust_scores (user_id, verified_phone, verified_id, photo_matched, show_up_rate, average_rating)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [U, ts.vp, ts.vid, ts.pm, ts.sur, ts.ar],
  );
}

beforeEach(async () => {
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ALL]);
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ALL]);
  await closeDatabase();
  await closeRedis();
});

describe('calculateTrustScore', () => {
  it('gives a fully-verified, tenured user the maximum 100', async () => {
    await seed({ vp: true, vid: true, pm: true, sur: 1, ar: 5 }, 12);
    // 20 + 25 + 10 + 25 + 15 + 5 (age) = 100
    expect(await calculateTrustScore(U)).toBe(100);
  });

  it('gives an unverified user with no history the minimum 0', async () => {
    await seed({ vp: false, vid: false, pm: false, sur: 0, ar: 0 }, 0);
    expect(await calculateTrustScore(U)).toBe(0);
  });

  it('weights show-up rate into the score', async () => {
    await seed({ vp: true, vid: false, pm: false, sur: 0.8, ar: 0 }, 0);
    // phone 20 + showUp 0.8*25 (20) = 40
    expect(await calculateTrustScore(U)).toBe(40);
  });

  it('subtracts 5 per report', async () => {
    await seed({ vp: true, vid: false, pm: false, sur: 0, ar: 0 }, 0); // base 20
    await pool.query(
      `INSERT INTO users (id, phone, is_verified, verification_tier) VALUES ($1, '+13055550009', true, 'phone')`,
      [REPORTER],
    );
    await pool.query(
      `INSERT INTO reports (reporter_id, reported_user_id, reason) VALUES ($1, $2, 'harassment')`,
      [REPORTER, U],
    );
    expect(await calculateTrustScore(U)).toBe(15);
  });

  it('clamps to 0 even with banned + deductions', async () => {
    await seed({ vp: false, vid: false, pm: false, sur: 0, ar: 0 }, 0, true);
    expect(await calculateTrustScore(U)).toBe(0);
  });
});
