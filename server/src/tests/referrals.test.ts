import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { pool, closeDatabase } from '../db/index.js';
import { redis, closeRedis } from '../db/redis.js';
import {
  trackReferral,
  getReferralStats,
  recordReferredFirstDate,
} from '../services/referrals.service.js';

const REFERRER = {
  id: 'dddd0000-0000-4000-8000-000000000000',
  phone: '+13055556000',
  code: 'TESTCODE',
};
const R1 = { id: 'dddd0001-0000-4000-8000-000000000001', phone: '+13055556001' };
const R2 = { id: 'dddd0002-0000-4000-8000-000000000002', phone: '+13055556002' };
const R3 = { id: 'dddd0003-0000-4000-8000-000000000003', phone: '+13055556003' };
const FREE = { id: 'dddd0004-0000-4000-8000-000000000004', phone: '+13055556004' };
const PLUS = { id: 'dddd0005-0000-4000-8000-000000000005', phone: '+13055556005' };
const ALL = [REFERRER, R1, R2, R3, FREE, PLUS];

let app: FastifyInstance;
let api: ReturnType<typeof request>;

const token = (u: { id: string; phone: string }): string =>
  jwt.sign({ userId: u.id, phone: u.phone }, process.env.JWT_SECRET!, { expiresIn: '1h' });

async function seedUser(
  u: { id: string; phone: string },
  name: string,
  code?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO users (id, phone, referral_code, is_verified, verification_tier)
     VALUES ($1, $2, $3, true, 'phone') ON CONFLICT (id) DO NOTHING`,
    [u.id, u.phone, code ?? null],
  );
  await pool.query(
    `INSERT INTO profiles (id, display_name, city) VALUES ($1, $2, 'Miami') ON CONFLICT (id) DO NOTHING`,
    [u.id, name],
  );
  await pool.query(
    `INSERT INTO trust_scores (user_id, verified_phone) VALUES ($1, true) ON CONFLICT (user_id) DO NOTHING`,
    [u.id],
  );
}

async function cleanup(): Promise<void> {
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ALL.map((u) => u.id)]);
  await redis.del(...ALL.map((u) => `plan:${u.id}`), ...ALL.map((u) => `stripe_customer:${u.id}`));
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  api = request(app.server);
});

afterAll(async () => {
  await app.close();
  await cleanup();
  await closeDatabase();
  await closeRedis();
});

beforeEach(cleanup);

describe('trackReferral', () => {
  it('records a click once and dedupes', async () => {
    await seedUser(REFERRER, 'Ref', REFERRER.code);
    await seedUser(R1, 'One');

    expect(await trackReferral(R1.id, REFERRER.code)).toEqual({ tracked: true });
    expect(await trackReferral(R1.id, REFERRER.code)).toEqual({ tracked: false });
  });

  it('rejects an invalid code', async () => {
    await seedUser(R1, 'One');
    await expect(trackReferral(R1.id, 'NOPECODE')).rejects.toThrow();
  });
});

describe('referral rewards', () => {
  it('grants boost credits then a Plus trial across tiers', async () => {
    await seedUser(REFERRER, 'Ref', REFERRER.code);
    for (const u of [R1, R2, R3]) {
      await seedUser(u, 'Friend');
      await pool.query(
        `INSERT INTO referrals (referrer_id, referred_id, referral_code, status)
         VALUES ($1, $2, $3, 'clicked')`,
        [REFERRER.id, u.id, REFERRER.code],
      );
    }

    await recordReferredFirstDate(R1.id); // count 1 -> +1 credit
    await recordReferredFirstDate(R2.id); // count 2 -> +1 credit

    let credits = await pool.query<{ boost_credits: number }>(
      'SELECT boost_credits FROM users WHERE id = $1',
      [REFERRER.id],
    );
    expect(credits.rows[0]!.boost_credits).toBe(2);

    await recordReferredFirstDate(R3.id); // count 3 -> Plus trial

    const sub = await pool.query<{ plan: string; status: string }>(
      'SELECT plan, status FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [REFERRER.id],
    );
    expect(sub.rows[0]!.plan).toBe('plus');
    expect(sub.rows[0]!.status).toBe('trialing');
    expect(await redis.get(`plan:${REFERRER.id}`)).toBe('plus');

    // Idempotent: re-running grants nothing new.
    await recordReferredFirstDate(R3.id);
    credits = await pool.query<{ boost_credits: number }>(
      'SELECT boost_credits FROM users WHERE id = $1',
      [REFERRER.id],
    );
    expect(credits.rows[0]!.boost_credits).toBe(2);
  });
});

describe('GET /referrals/stats', () => {
  it('returns the dashboard for the user', async () => {
    await seedUser(REFERRER, 'Ref', REFERRER.code);
    const res = await api.get('/referrals/stats').set('Authorization', `Bearer ${token(REFERRER)}`);

    expect(res.status).toBe(200);
    expect(res.body.referralCode).toBe('TESTCODE');
    expect(res.body.referralLink).toBe('https://rightnow.app/join/TESTCODE');
    expect(res.body.tiers).toHaveLength(5);
    expect(res.body.currentTier.friendsAway).toBe(1);
    expect(res.body.totalReferred).toBe(0);
  });

  it('generates a code if the user lacks one', async () => {
    await seedUser(R1, 'One'); // no code
    const stats = await getReferralStats(R1.id);
    expect(stats.referralCode).toMatch(/^[A-Z2-9]{8}$/);
  });
});

describe('plan gating', () => {
  it('blocks free users from a Plus feature and allows Plus users', async () => {
    await seedUser(FREE, 'Freebie');
    const blocked = await api
      .get('/sparks/who-viewed')
      .set('Authorization', `Bearer ${token(FREE)}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.upgradeRequired).toBe(true);
    expect(blocked.body.requiredPlan).toBe('plus');

    await seedUser(PLUS, 'Premium');
    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, billing_period, status, current_period_end)
       VALUES ($1, 'plus', 'monthly', 'trialing', NOW() + INTERVAL '7 days')`,
      [PLUS.id],
    );
    const allowed = await api
      .get('/sparks/who-viewed')
      .set('Authorization', `Bearer ${token(PLUS)}`);
    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body.viewers)).toBe(true);
  });

  it('requires VIP for boost credits', async () => {
    await seedUser(FREE, 'Freebie');
    const res = await api
      .post('/boost/use-credit')
      .set('Authorization', `Bearer ${token(FREE)}`)
      .send({ sessionId: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).toBe(403);
    expect(res.body.requiredPlan).toBe('vip');
  });
});
