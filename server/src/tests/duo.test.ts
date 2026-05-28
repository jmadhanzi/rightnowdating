import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { pool, closeDatabase } from '../db/index.js';
import { closeRedis } from '../db/redis.js';
import {
  inviteDuo,
  acceptDuo,
  endDuo,
  getMyDuo,
  searchUsersForDuo,
  fireDuoSpark,
} from '../services/duo.service.js';

const USER_A = 'd3330001-0000-4000-8000-000000000001';
const USER_B = 'd3330002-0000-4000-8000-000000000002';
const USER_C = 'd3330003-0000-4000-8000-000000000003';
const ALL    = [USER_A, USER_B, USER_C];

async function seed(): Promise<void> {
  const users = [
    [USER_A, '+13055559701', 'DuoUserA'],
    [USER_B, '+13055559702', 'DuoUserB'],
    [USER_C, '+13055559703', 'DuoUserC'],
  ] as const;

  for (const [id, phone, name] of users) {
    await pool.query(
      'INSERT INTO users (id, phone, is_verified) VALUES ($1, $2, true) ON CONFLICT (id) DO NOTHING',
      [id, phone],
    );
    await pool.query(
      `INSERT INTO profiles (id, display_name, age, city, avatar_emoji)
       VALUES ($1, $2, 25, 'Miami', '🧑') ON CONFLICT (id) DO NOTHING`,
      [id, name],
    );
    await pool.query(
      "INSERT INTO trust_scores (user_id, score) VALUES ($1, 70) ON CONFLICT (user_id) DO NOTHING",
      [id],
    );
  }
}

async function cleanup(): Promise<void> {
  await pool.query('DELETE FROM duos WHERE inviter_id = ANY($1) OR partner_id = ANY($1)', [ALL]);
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ALL]);
}

beforeEach(async () => {
  await cleanup();
  await seed();
});

afterAll(async () => {
  await cleanup();
  await closeDatabase();
  await closeRedis();
});

describe('inviteDuo()', () => {
  it('creates a pending duo between two users', async () => {
    const { duoId } = await inviteDuo(USER_A, USER_B);
    expect(duoId).toBeDefined();

    const duo = await getMyDuo(USER_A);
    expect(duo).not.toBeNull();
    expect(duo!.status).toBe('pending');
    expect(duo!.partner.id).toBe(USER_B);
  });

  it('throws when user tries to duo with themselves', async () => {
    await expect(inviteDuo(USER_A, USER_A)).rejects.toThrow();
  });

  it('rejects inviting a user already in an active duo', async () => {
    // First create and activate a duo for USER_B with USER_C
    const { duoId: d1 } = await inviteDuo(USER_C, USER_B);
    await acceptDuo(d1, USER_B);

    // Now try to invite USER_B from USER_A — should fail
    await expect(inviteDuo(USER_A, USER_B)).rejects.toThrow();
  });
});

describe('acceptDuo()', () => {
  it('activates a pending duo', async () => {
    const { duoId } = await inviteDuo(USER_A, USER_B);
    await acceptDuo(duoId, USER_B);

    const duoA = await getMyDuo(USER_A);
    expect(duoA!.status).toBe('active');

    const duoB = await getMyDuo(USER_B);
    expect(duoB!.status).toBe('active');
  });

  it('throws when wrong user tries to accept', async () => {
    const { duoId } = await inviteDuo(USER_A, USER_B);
    // USER_C is not the invite recipient
    await expect(acceptDuo(duoId, USER_C)).rejects.toThrow();
  });
});

describe('endDuo()', () => {
  it('ends an active duo for either member', async () => {
    const { duoId } = await inviteDuo(USER_A, USER_B);
    await acceptDuo(duoId, USER_B);
    await endDuo(duoId, USER_A); // inviter ends it

    const duo = await getMyDuo(USER_A);
    expect(duo).toBeNull();
  });

  it('throws when non-member tries to end the duo', async () => {
    const { duoId } = await inviteDuo(USER_A, USER_B);
    await acceptDuo(duoId, USER_B);
    await expect(endDuo(duoId, USER_C)).rejects.toThrow();
  });
});

describe('getMyDuo()', () => {
  it('returns null when user has no duo', async () => {
    const duo = await getMyDuo(USER_A);
    expect(duo).toBeNull();
  });

  it('returns pending duo from inviter perspective', async () => {
    await inviteDuo(USER_A, USER_B);
    const duo = await getMyDuo(USER_A);
    expect(duo).not.toBeNull();
    expect(duo!.partner.id).toBe(USER_B);
    expect(duo!.status).toBe('pending');
  });

  it('returns pending duo from partner perspective', async () => {
    await inviteDuo(USER_A, USER_B);
    const duo = await getMyDuo(USER_B);
    expect(duo).not.toBeNull();
    expect(duo!.partner.id).toBe(USER_A);
    expect(duo!.status).toBe('pending');
  });
});

describe('searchUsersForDuo()', () => {
  it('finds users by partial display name', async () => {
    const results = await searchUsersForDuo('DuoUserB', USER_A);
    expect(results.some((u) => u.id === USER_B)).toBe(true);
  });

  it('does not return the requester themselves', async () => {
    const results = await searchUsersForDuo('DuoUserA', USER_A);
    expect(results.every((u) => u.id !== USER_A)).toBe(true);
  });

  it('does not return users already in an active duo', async () => {
    const { duoId } = await inviteDuo(USER_C, USER_B);
    await acceptDuo(duoId, USER_B);

    const results = await searchUsersForDuo('DuoUserB', USER_A);
    expect(results.every((u) => u.id !== USER_B)).toBe(true);
  });
});

describe('fireDuoSpark()', () => {
  it('throws when targeting own duo', async () => {
    const { duoId } = await inviteDuo(USER_A, USER_B);
    await acceptDuo(duoId, USER_B);

    // Cannot spark yourself
    await expect(
      fireDuoSpark({ fromDuoId: duoId, sparkingUserId: USER_A, toUserId: USER_C }),
    ).resolves.toBeDefined(); // targeting USER_C (not in duo) is fine

    await expect(
      fireDuoSpark({ fromDuoId: duoId, sparkingUserId: USER_A, toDuoId: duoId }),
    ).rejects.toThrow('Cannot spark your own duo');
  });

  it('requires an active duo to fire a duo spark', async () => {
    // Only a pending duo exists
    const { duoId } = await inviteDuo(USER_A, USER_B);

    await expect(
      fireDuoSpark({ fromDuoId: duoId, sparkingUserId: USER_A, toUserId: USER_C }),
    ).rejects.toThrow('not active');
  });

  it('requires either toDuoId or toUserId', async () => {
    const { duoId } = await inviteDuo(USER_A, USER_B);
    await acceptDuo(duoId, USER_B);

    await expect(
      fireDuoSpark({ fromDuoId: duoId, sparkingUserId: USER_A }),
    ).rejects.toThrow('Must target');
  });
});
