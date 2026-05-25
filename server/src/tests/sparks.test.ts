import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { pool, closeDatabase } from '../db/index.js';
import { closeRedis } from '../db/redis.js';
import {
  createSpark,
  acceptSpark,
  createMatch,
  expireSpark,
  SPARK_TTL_SECONDS,
} from '../services/sparks.service.js';

const A = 'f3330001-0000-4000-8000-000000000001';
const B = 'f3330002-0000-4000-8000-000000000002';
const SA = 'f3330011-0000-4000-8000-000000000011';
const SB = 'f3330012-0000-4000-8000-000000000012';
const ALL = [A, B];

async function seed(): Promise<void> {
  for (const [id, phone, sid, lng, lat] of [
    [A, '+13055551001', SA, -80.2, 25.8],
    [B, '+13055551002', SB, -80.19, 25.79],
  ] as const) {
    await pool.query(
      `INSERT INTO users (id, phone, is_verified, verification_tier) VALUES ($1, $2, true, 'phone')
       ON CONFLICT (id) DO NOTHING`,
      [id, phone],
    );
    await pool.query(
      `INSERT INTO profiles (id, display_name, age, city) VALUES ($1, 'T', 28, 'Miami')
       ON CONFLICT (id) DO NOTHING`,
      [id],
    );
    await pool.query(
      `INSERT INTO live_sessions (id, user_id, location, fuzzy_location, vibe, window_minutes, expires_at, is_active)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), ST_SetSRID(ST_MakePoint($3, $4), 4326),
               'coffee', 60, NOW() + INTERVAL '1 hour', true)
       ON CONFLICT (id) DO NOTHING`,
      [sid, id, lng, lat],
    );
  }
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

describe('sparks service', () => {
  it('creates a pending spark with a 7-minute window', async () => {
    const before = Date.now();
    const { sparkId, expiresAt } = await createSpark({
      senderId: A,
      receiverId: B,
      senderSessionId: SA,
      receiverSessionId: SB,
    });
    expect(sparkId).toBeTruthy();
    const ttl = (expiresAt.getTime() - before) / 1000;
    expect(ttl).toBeGreaterThan(SPARK_TTL_SECONDS - 5);
    expect(ttl).toBeLessThanOrEqual(SPARK_TTL_SECONDS + 1);

    const { rows } = await pool.query<{ status: string }>(
      'SELECT status FROM sparks WHERE id = $1',
      [sparkId],
    );
    expect(rows[0]!.status).toBe('pending');
  });

  it('rejects sparking yourself', async () => {
    await expect(
      createSpark({ senderId: A, receiverId: A, senderSessionId: SA, receiverSessionId: SA }),
    ).rejects.toThrow();
  });

  it('dedupes duplicate sparks in the same session', async () => {
    const first = await createSpark({
      senderId: A,
      receiverId: B,
      senderSessionId: SA,
      receiverSessionId: SB,
    });
    const second = await createSpark({
      senderId: A,
      receiverId: B,
      senderSessionId: SA,
      receiverSessionId: SB,
    });
    expect(second.sparkId).toBe(first.sparkId);
    const { rows } = await pool.query<{ c: number }>(
      'SELECT COUNT(*)::int AS c FROM sparks WHERE sender_id = $1 AND receiver_id = $2',
      [A, B],
    );
    expect(rows[0]!.c).toBe(1);
  });

  it('accepting a mutual spark creates a match', async () => {
    const { sparkId } = await createSpark({
      senderId: A,
      receiverId: B,
      senderSessionId: SA,
      receiverSessionId: SB,
    });
    const accepted = await acceptSpark(sparkId, B);
    expect(accepted?.senderId).toBe(A);

    const { matchId } = await createMatch({
      sparkId,
      user1Id: A,
      user2Id: B,
      venueId: null,
      meetupTime: new Date(Date.now() + 20 * 60 * 1000),
    });
    const match = await pool.query<{ status: string }>('SELECT status FROM matches WHERE id = $1', [
      matchId,
    ]);
    expect(match.rows[0]!.status).toBe('active');
  });

  it('expires a pending spark once', async () => {
    const { sparkId } = await createSpark({
      senderId: A,
      receiverId: B,
      senderSessionId: SA,
      receiverSessionId: SB,
    });
    const expired = await expireSpark(sparkId);
    expect(expired).toEqual({ senderId: A, receiverId: B });
    // Already expired → no-op.
    expect(await expireSpark(sparkId)).toBeNull();
  });
});
