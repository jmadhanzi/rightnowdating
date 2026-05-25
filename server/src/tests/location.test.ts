import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { pool, closeDatabase } from '../db/index.js';
import { closeRedis } from '../db/redis.js';
import {
  applyFuzzyLocation,
  calculateMidpoint,
  getNearbyUsers,
} from '../services/location.service.js';

const ME = 'f1110001-0000-4000-8000-000000000001';
const OTHER = 'f1110002-0000-4000-8000-000000000002';
const ALL = [ME, OTHER];

async function seedSession(userId: string, lat: number, lng: number): Promise<void> {
  await pool.query(
    `INSERT INTO users (id, phone, is_verified, verification_tier) VALUES ($1, $2, true, 'phone')
     ON CONFLICT (id) DO NOTHING`,
    [userId, `+1786555${userId.slice(-4)}`],
  );
  await pool.query(
    `INSERT INTO profiles (id, display_name, age, city) VALUES ($1, 'Tester', 28, 'Miami')
     ON CONFLICT (id) DO NOTHING`,
    [userId],
  );
  await pool.query(
    `INSERT INTO live_sessions (user_id, location, fuzzy_location, vibe, window_minutes, expires_at, is_active)
     VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), ST_SetSRID(ST_MakePoint($2, $3), 4326),
             'coffee', 60, NOW() + INTERVAL '1 hour', true)`,
    [userId, lng, lat],
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

describe('applyFuzzyLocation', () => {
  it('snaps to the nearest 0.002 degree grid', () => {
    const { fuzzyLat, fuzzyLng } = applyFuzzyLocation(25.76173, -80.19181);
    expect(Math.round(fuzzyLat / 0.002) * 0.002).toBeCloseTo(fuzzyLat, 6);
    expect(Math.round(fuzzyLng / 0.002) * 0.002).toBeCloseTo(fuzzyLng, 6);
  });

  it('differs from the input by at most 0.002 degrees', () => {
    const inputs: [number, number][] = [
      [25.7617, -80.1918],
      [40.7128, -74.006],
      [25.80031, -80.19913],
    ];
    for (const [lat, lng] of inputs) {
      const { fuzzyLat, fuzzyLng } = applyFuzzyLocation(lat, lng);
      expect(Math.abs(fuzzyLat - lat)).toBeLessThanOrEqual(0.002);
      expect(Math.abs(fuzzyLng - lng)).toBeLessThanOrEqual(0.002);
    }
  });
});

describe('calculateMidpoint', () => {
  it('returns the geographic midpoint of two nearby points', () => {
    const mid = calculateMidpoint(25.8, -80.2, 25.76, -80.18);
    expect(mid.lat).toBeCloseTo(25.78, 2);
    expect(mid.lng).toBeCloseTo(-80.19, 2);
  });
});

describe('getNearbyUsers', () => {
  it('excludes the requesting user from results', async () => {
    await seedSession(ME, 25.8, -80.2);
    await seedSession(OTHER, 25.801, -80.201);

    const results = await getNearbyUsers(25.8, -80.2, 5, ME);
    const ids = results.map((r) => r.sessionId);
    expect(results.some((r) => r.displayName === 'Tester')).toBe(true);

    const mine = await pool.query<{ id: string }>(
      'SELECT id FROM live_sessions WHERE user_id = $1',
      [ME],
    );
    expect(ids).not.toContain(mine.rows[0]!.id);
  });
});
