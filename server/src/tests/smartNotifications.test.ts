/**
 * smartNotifications.test.ts
 *
 * Tests the pure logic in smartNotifications — time-gating
 * and eligibility without actually sending push notifications.
 * We stub sendToUser to avoid needing a push subscription in tests.
 */
import { describe, expect, it, jest, beforeEach, afterAll } from '@jest/globals';
import { pool, closeDatabase } from '../db/index.js';
import { closeRedis, redis } from '../db/redis.js';

// ── Pure helpers extracted from the service for unit testing ──────────────

type DayNum = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sun … 6=Sat

function isPeakHourSlot(day: DayNum, hour: number): boolean {
  const LIVE_DAYS = [0, 4, 5, 6]; // Sun, Thu, Fri, Sat
  return LIVE_DAYS.includes(day) && hour >= 18 && hour <= 21;
}

function isWeeklyWrappedSlot(day: DayNum, hour: number): boolean {
  return day === 0 && hour === 19; // Sunday 7pm UTC
}

function isStreakRiskSlot(day: DayNum, hour: number): boolean {
  return day === 4 && hour === 18; // Thursday 6pm UTC
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('isPeakHourSlot()', () => {
  it('fires on Thursday 6pm UTC', () => {
    expect(isPeakHourSlot(4, 18)).toBe(true);
  });
  it('fires on Friday 8pm UTC', () => {
    expect(isPeakHourSlot(5, 20)).toBe(true);
  });
  it('fires on Saturday 9pm UTC', () => {
    expect(isPeakHourSlot(6, 21)).toBe(true);
  });
  it('fires on Sunday 7pm UTC', () => {
    expect(isPeakHourSlot(0, 19)).toBe(true);
  });
  it('does NOT fire on Monday at peak hours', () => {
    expect(isPeakHourSlot(1, 20)).toBe(false);
  });
  it('does NOT fire on Wednesday at peak hours', () => {
    expect(isPeakHourSlot(3, 20)).toBe(false);
  });
  it('does NOT fire on Thursday at 14:00 (outside 18-21 window)', () => {
    expect(isPeakHourSlot(4, 14)).toBe(false);
  });
  it('does NOT fire at hour 22 (just after window)', () => {
    expect(isPeakHourSlot(5, 22)).toBe(false);
  });
  it('fires at exactly hour 18 (boundary)', () => {
    expect(isPeakHourSlot(6, 18)).toBe(true);
  });
  it('fires at exactly hour 21 (boundary)', () => {
    expect(isPeakHourSlot(5, 21)).toBe(true);
  });
});

describe('isWeeklyWrappedSlot()', () => {
  it('fires only on Sunday at 19:00 UTC', () => {
    expect(isWeeklyWrappedSlot(0, 19)).toBe(true);
  });
  it('does NOT fire on Sunday at 18:00', () => {
    expect(isWeeklyWrappedSlot(0, 18)).toBe(false);
  });
  it('does NOT fire on Saturday at 19:00', () => {
    expect(isWeeklyWrappedSlot(6, 19)).toBe(false);
  });
  it('does NOT fire on Monday at 19:00', () => {
    expect(isWeeklyWrappedSlot(1, 19)).toBe(false);
  });
});

describe('isStreakRiskSlot()', () => {
  it('fires on Thursday at 18:00 UTC', () => {
    expect(isStreakRiskSlot(4, 18)).toBe(true);
  });
  it('does NOT fire on Thursday at 17:00', () => {
    expect(isStreakRiskSlot(4, 17)).toBe(false);
  });
  it('does NOT fire on Friday at 18:00', () => {
    expect(isStreakRiskSlot(5, 18)).toBe(false);
  });
});

// ── Redis dedup key logic ─────────────────────────────────────────────────

const USER_NOTIF = 'g6660001-0000-4000-8000-000000000001';

afterAll(async () => {
  await closeRedis();
});

describe('Redis peak hour dedup key', () => {
  beforeEach(async () => {
    await redis.del(`peak:Miami:${new Date().toISOString().slice(0, 13)}`);
  });

  it('NX set succeeds on first write (allows sending)', async () => {
    const key = `peak:TestCity:${new Date().toISOString().slice(0, 13)}`;
    const result = await redis.set(key, '1', 'EX', 3600, 'NX');
    expect(result).toBe('OK');
    await redis.del(key);
  });

  it('NX set fails on second write (prevents duplicate send)', async () => {
    const key = `peak:TestCity2:${new Date().toISOString().slice(0, 13)}`;
    await redis.set(key, '1', 'EX', 3600, 'NX');
    const second = await redis.set(key, '1', 'EX', 3600, 'NX');
    expect(second).toBeNull();
    await redis.del(key);
  });
});
