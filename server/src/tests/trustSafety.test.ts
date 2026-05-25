import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { pool, closeDatabase } from '../db/index.js';
import { closeRedis } from '../db/redis.js';
import {
  calculateTrustScore,
  recalculateTrustScore,
  visibilityForScore,
} from '../services/trustScore.service.js';

const TARGET = { id: 'cccc1111-1111-4111-8111-111111111111', phone: '+13055558001' };
const REPORTER = { id: 'cccc2222-2222-4222-8222-222222222222', phone: '+13055558002' };
const CONTACT_OWNER = { id: 'cccc3333-3333-4333-8333-333333333333', phone: '+13055558003' };
const ALL = [TARGET, REPORTER, CONTACT_OWNER];

let app: FastifyInstance;
let api: ReturnType<typeof request>;

function token(u: { id: string; phone: string }): string {
  return jwt.sign({ userId: u.id, phone: u.phone }, process.env.JWT_SECRET!, { expiresIn: '1h' });
}

interface TrustFields {
  vp: boolean;
  vid: boolean;
  pm: boolean;
  sur: number;
  ar: number;
}

async function seedUser(
  u: { id: string; phone: string },
  name: string,
  ts: TrustFields = { vp: true, vid: false, pm: false, sur: 1, ar: 0 },
): Promise<void> {
  await pool.query(
    `INSERT INTO users (id, phone, is_verified, verification_tier) VALUES ($1, $2, true, 'phone')
     ON CONFLICT (id) DO NOTHING`,
    [u.id, u.phone],
  );
  await pool.query(
    `INSERT INTO profiles (id, display_name, age, city) VALUES ($1, $2, 28, 'Miami')
     ON CONFLICT (id) DO NOTHING`,
    [u.id, name],
  );
  await pool.query(
    `INSERT INTO trust_scores (user_id, verified_phone, verified_id, photo_matched, show_up_rate, average_rating)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       verified_phone = EXCLUDED.verified_phone,
       verified_id = EXCLUDED.verified_id,
       photo_matched = EXCLUDED.photo_matched,
       show_up_rate = EXCLUDED.show_up_rate,
       average_rating = EXCLUDED.average_rating`,
    [u.id, ts.vp, ts.vid, ts.pm, ts.sur, ts.ar],
  );
}

async function cleanup(): Promise<void> {
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ALL.map((u) => u.id)]);
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

describe('visibilityForScore', () => {
  it('maps scores to visibility tiers', () => {
    expect(visibilityForScore(20)).toEqual({ percent: 25, priority: false });
    expect(visibilityForScore(50)).toEqual({ percent: 60, priority: false });
    expect(visibilityForScore(75)).toEqual({ percent: 85, priority: false });
    expect(visibilityForScore(95)).toEqual({ percent: 100, priority: true });
  });
});

describe('calculateTrustScore', () => {
  it('sums weighted signals correctly', async () => {
    // phone(20) + id(25) + photo(10) + showUp 0.8*25(20) + rating 4*3(12) = 87
    await seedUser(TARGET, 'Tara', { vp: true, vid: true, pm: true, sur: 0.8, ar: 4 });
    const score = await calculateTrustScore(TARGET.id);
    expect(score).toBe(87);
  });

  it('applies report and safety-concern deductions', async () => {
    await seedUser(TARGET, 'Tara', { vp: true, vid: true, pm: true, sur: 0.8, ar: 4 });
    await seedUser(REPORTER, 'Rob');
    await pool.query(
      `INSERT INTO reports (reporter_id, reported_user_id, reason) VALUES ($1, $2, 'harassment')`,
      [REPORTER.id, TARGET.id],
    );
    const score = await recalculateTrustScore(TARGET.id);
    expect(score).toBe(82); // 87 - 5
  });

  it('clamps to 0 and 100', async () => {
    // No verification, no ratings, banned → deductions push below 0.
    await seedUser(TARGET, 'Tara', { vp: false, vid: false, pm: false, sur: 0, ar: 0 });
    await pool.query('UPDATE users SET is_banned = true WHERE id = $1', [TARGET.id]);
    const score = await calculateTrustScore(TARGET.id);
    expect(score).toBe(0);
  });
});

describe('POST /safety/trusted-contacts', () => {
  it('saves up to 3 contacts and rejects more', async () => {
    await seedUser(CONTACT_OWNER, 'Cleo');
    const ok = await api
      .post('/safety/trusted-contacts')
      .set('Authorization', `Bearer ${token(CONTACT_OWNER)}`)
      .send({
        contacts: [
          { name: 'Mom', phone: '+13055550101', isPrimary: true },
          { name: 'Sis', phone: '+13055550102' },
          { name: 'Bff', phone: '+13055550103' },
        ],
      });
    expect(ok.status).toBe(200);
    expect(ok.body.success).toBe(true);
    expect(ok.body.contacts).toHaveLength(3);

    const tooMany = await api
      .post('/safety/trusted-contacts')
      .set('Authorization', `Bearer ${token(CONTACT_OWNER)}`)
      .send({
        contacts: [
          { name: 'A', phone: '+13055550101' },
          { name: 'B', phone: '+13055550102' },
          { name: 'C', phone: '+13055550103' },
          { name: 'D', phone: '+13055550104' },
        ],
      });
    expect(tooMany.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await api.post('/safety/trusted-contacts').send({ contacts: [] });
    expect(res.status).toBe(401);
  });
});

describe('POST /safety/report', () => {
  it('records a report and auto-suspends after 3 in 7 days', async () => {
    await seedUser(TARGET, 'Tara', { vp: true, vid: true, pm: true, sur: 1, ar: 5 });
    await seedUser(REPORTER, 'Rob');
    const auth = `Bearer ${token(REPORTER)}`;

    for (let i = 0; i < 2; i++) {
      const r = await api
        .post('/safety/report')
        .set('Authorization', auth)
        .send({ reportedUserId: TARGET.id, reason: 'harassment' });
      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
    }

    // Not suspended yet (2 reports).
    let suspended = await pool.query<{ is_suspended: boolean }>(
      'SELECT is_suspended FROM users WHERE id = $1',
      [TARGET.id],
    );
    expect(suspended.rows[0]!.is_suspended).toBe(false);

    // Third report crosses the threshold.
    const third = await api
      .post('/safety/report')
      .set('Authorization', auth)
      .send({ reportedUserId: TARGET.id, reason: 'felt_unsafe' });
    expect(third.status).toBe(200);

    suspended = await pool.query<{ is_suspended: boolean }>(
      'SELECT is_suspended FROM users WHERE id = $1',
      [TARGET.id],
    );
    expect(suspended.rows[0]!.is_suspended).toBe(true);
  });

  it('rejects an invalid reason', async () => {
    await seedUser(REPORTER, 'Rob');
    await seedUser(TARGET, 'Tara');
    const res = await api
      .post('/safety/report')
      .set('Authorization', `Bearer ${token(REPORTER)}`)
      .send({ reportedUserId: TARGET.id, reason: 'not_a_reason' });
    expect(res.status).toBe(400);
  });
});
