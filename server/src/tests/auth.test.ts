import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { pool, closeDatabase } from '../db/index.js';
import { redis, closeRedis } from '../db/redis.js';

const PHONE_A = '+13055559001';
const PHONE_B = '+13055559002';
const PHONE_RATE = '+13055559003';
const BAD_PHONE = '12345';
const KNOWN_OTP = '654321'; // never collides with the demo code 123456

let app: FastifyInstance;
let api: ReturnType<typeof request>;

async function cleanupPhones(): Promise<void> {
  await pool.query('DELETE FROM users WHERE phone = ANY($1)', [[PHONE_A, PHONE_B, PHONE_RATE]]);
  await redis.del(
    `otp:${PHONE_A}`,
    `otp:rate:${PHONE_A}`,
    `otp:${PHONE_B}`,
    `otp:rate:${PHONE_B}`,
    `otp:${PHONE_RATE}`,
    `otp:rate:${PHONE_RATE}`,
  );
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  api = request(app.server);
});

afterAll(async () => {
  await app.close();
  await cleanupPhones();
  await closeDatabase();
  await closeRedis();
});

beforeEach(cleanupPhones);

describe('POST /auth/request-otp', () => {
  it('issues an OTP for a valid E.164 phone', async () => {
    const res = await api.post('/auth/request-otp').send({ phone: PHONE_A });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, expiresIn: 600 });

    const stored = await redis.get(`otp:${PHONE_A}`);
    expect(stored).toMatch(/^\d{6}$/);
  });

  it('rejects an invalid phone format', async () => {
    const res = await api.post('/auth/request-otp').send({ phone: BAD_PHONE });
    expect(res.status).toBe(400);
    expect(res.body.statusCode).toBe(400);
    // Stack traces must never leak.
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\(.*:\d+:\d+\)/);
  });

  it('rate limits after 3 requests in the window', async () => {
    await redis.del(`otp:rate:${PHONE_RATE}`);
    for (let i = 0; i < 3; i++) {
      const ok = await api.post('/auth/request-otp').send({ phone: PHONE_RATE });
      expect(ok.status).toBe(200);
    }
    const blocked = await api.post('/auth/request-otp').send({ phone: PHONE_RATE });
    expect(blocked.status).toBe(429);
  });
});

describe('POST /auth/verify-otp', () => {
  it('verifies the real OTP, creates the user, and returns tokens', async () => {
    await api.post('/auth/request-otp').send({ phone: PHONE_A });
    const otp = await redis.get(`otp:${PHONE_A}`);
    expect(otp).not.toBeNull();

    const res = await api.post('/auth/verify-otp').send({ phone: PHONE_A, otp });
    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(true);
    expect(typeof res.body.userId).toBe('string');
    expect(res.body.accessToken.split('.')).toHaveLength(3); // JWT shape
    expect(typeof res.body.refreshToken).toBe('string');

    // OTP is consumed (single-use).
    expect(await redis.get(`otp:${PHONE_A}`)).toBeNull();
  });

  it('returns isNewUser=false for an existing user', async () => {
    await redis.set(`otp:${PHONE_A}`, KNOWN_OTP, 'EX', 600);
    const first = await api.post('/auth/verify-otp').send({ phone: PHONE_A, otp: KNOWN_OTP });
    expect(first.body.isNewUser).toBe(true);

    await redis.set(`otp:${PHONE_A}`, KNOWN_OTP, 'EX', 600);
    const second = await api.post('/auth/verify-otp').send({ phone: PHONE_A, otp: KNOWN_OTP });
    expect(second.status).toBe(200);
    expect(second.body.isNewUser).toBe(false);
  });

  it('rejects a wrong OTP code', async () => {
    await redis.set(`otp:${PHONE_A}`, KNOWN_OTP, 'EX', 600);
    const res = await api.post('/auth/verify-otp').send({ phone: PHONE_A, otp: '000000' });
    expect(res.status).toBe(401);
  });

  it('rejects an expired/missing OTP', async () => {
    await redis.set(`otp:${PHONE_A}`, KNOWN_OTP, 'EX', 600);
    await redis.del(`otp:${PHONE_A}`); // simulate TTL expiry
    const res = await api.post('/auth/verify-otp').send({ phone: PHONE_A, otp: KNOWN_OTP });
    expect(res.status).toBe(401);
  });

  it('prevents OTP reuse', async () => {
    await redis.set(`otp:${PHONE_A}`, KNOWN_OTP, 'EX', 600);
    const first = await api.post('/auth/verify-otp').send({ phone: PHONE_A, otp: KNOWN_OTP });
    expect(first.status).toBe(200);

    const replay = await api.post('/auth/verify-otp').send({ phone: PHONE_A, otp: KNOWN_OTP });
    expect(replay.status).toBe(401);
  });

  it('accepts the demo code 123456 in DEMO_MODE', async () => {
    const res = await api.post('/auth/verify-otp').send({ phone: PHONE_B, otp: '123456' });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
  });
});

describe('POST /auth/refresh', () => {
  it('issues a new access token for a valid refresh token', async () => {
    await redis.set(`otp:${PHONE_A}`, KNOWN_OTP, 'EX', 600);
    const verify = await api.post('/auth/verify-otp').send({ phone: PHONE_A, otp: KNOWN_OTP });
    const { refreshToken } = verify.body;

    const res = await api.post('/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken.split('.')).toHaveLength(3);
  });

  it('rejects an unknown refresh token', async () => {
    const res = await api.post('/auth/refresh').send({ refreshToken: 'not-a-real-token' });
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('invalidates the refresh token', async () => {
    await redis.set(`otp:${PHONE_A}`, KNOWN_OTP, 'EX', 600);
    const verify = await api.post('/auth/verify-otp').send({ phone: PHONE_A, otp: KNOWN_OTP });
    const { refreshToken } = verify.body;

    const out = await api.post('/auth/logout').send({ refreshToken });
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ success: true });

    // The token can no longer be refreshed.
    const res = await api.post('/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(401);
  });
});
