import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { pool, closeDatabase } from '../db/index.js';
import { closeRedis } from '../db/redis.js';
import {
  isLiveNight,
  recordGoLiveForStreak,
  getStreakInfo,
} from '../services/streak.service.js';

const USER_A = 'b1110001-0000-4000-8000-000000000001';
const ALL    = [USER_A];

async function seed(): Promise<void> {
  await pool.query(
    `INSERT INTO users (id, phone, is_verified) VALUES ($1, '+13055559901', true)
     ON CONFLICT (id) DO NOTHING`,
    [USER_A],
  );
  await pool.query(
    `INSERT INTO profiles (id, display_name, age, city) VALUES ($1, 'StreakUser', 25, 'Miami')
     ON CONFLICT (id) DO NOTHING`,
    [USER_A],
  );
  await pool.query('DELETE FROM night_streaks WHERE user_id = $1', [USER_A]);
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

describe('isLiveNight()', () => {
  it('returns true for Thursday evening', () => {
    // Thursday 20:00 UTC
    const thu = new Date('2026-06-04T20:00:00Z'); // a Thursday
    expect(thu.getUTCDay()).toBe(4);
    expect(isLiveNight(thu)).toBe(true);
  });

  it('returns true for Friday evening', () => {
    const fri = new Date('2026-06-05T21:00:00Z');
    expect(isLiveNight(fri)).toBe(true);
  });

  it('returns true for Saturday evening', () => {
    const sat = new Date('2026-06-06T22:30:00Z');
    expect(isLiveNight(sat)).toBe(true);
  });

  it('returns true for Sunday evening', () => {
    const sun = new Date('2026-06-07T19:00:00Z');
    expect(isLiveNight(sun)).toBe(true);
  });

  it('returns true for Saturday 1am (late night rolling)', () => {
    const late = new Date('2026-06-07T01:00:00Z'); // Sun 1am treated as Sat night
    expect(isLiveNight(late)).toBe(true);
  });

  it('returns false for Monday morning', () => {
    const mon = new Date('2026-06-08T09:00:00Z');
    expect(isLiveNight(mon)).toBe(false);
  });

  it('returns false for Wednesday afternoon', () => {
    const wed = new Date('2026-06-10T15:00:00Z');
    expect(isLiveNight(wed)).toBe(false);
  });

  it('returns false for Thursday 14:00 (before 17:00 threshold)', () => {
    const earlyThu = new Date('2026-06-04T14:00:00Z');
    expect(isLiveNight(earlyThu)).toBe(false);
  });
});

describe('recordGoLiveForStreak()', () => {
  it('creates a streak of 1 on first qualifying night', async () => {
    // Mock Date to be a Thursday evening
    const mockDate = new Date('2026-06-04T20:00:00Z');
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);

    const info = await recordGoLiveForStreak(USER_A);
    expect(info.currentStreak).toBe(1);
    expect(info.longestStreak).toBe(1);
    expect(info.totalLiveNights).toBe(1);
    expect(info.isActive).toBe(true);

    jest.useRealTimers();
  });

  it('does not double-count the same night', async () => {
    const mockDate = new Date('2026-06-04T20:00:00Z');
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);

    await recordGoLiveForStreak(USER_A);
    const second = await recordGoLiveForStreak(USER_A);
    expect(second.currentStreak).toBe(1);
    expect(second.totalLiveNights).toBe(1);

    jest.useRealTimers();
  });

  it('returns idle state on a non-qualifying night (Tuesday)', async () => {
    const tue = new Date('2026-06-09T20:00:00Z'); // Tuesday
    jest.useFakeTimers();
    jest.setSystemTime(tue);

    const info = await recordGoLiveForStreak(USER_A);
    // Non-qualifying — streak should not increment
    expect(info.currentStreak).toBe(0);

    jest.useRealTimers();
  });
});

describe('getStreakInfo()', () => {
  it('returns zero-state for a user with no streak', async () => {
    const info = await getStreakInfo(USER_A);
    expect(info.currentStreak).toBe(0);
    expect(info.longestStreak).toBe(0);
    expect(info.totalLiveNights).toBe(0);
    expect(info.isActive).toBe(false);
    expect(info.lastLiveNight).toBeNull();
  });
});
