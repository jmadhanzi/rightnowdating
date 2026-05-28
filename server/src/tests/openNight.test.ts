import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { pool, closeDatabase } from '../db/index.js';
import { closeRedis } from '../db/redis.js';
import {
  createOpenNight,
  getNearbyOpenNights,
  requestJoinOpenNight,
  respondToJoinRequest,
} from '../services/duo.service.js';

const HOST  = 'f5550001-0000-4000-8000-000000000001';
const GUEST = 'f5550002-0000-4000-8000-000000000002';
const ALL   = [HOST, GUEST];

// Miami coordinates
const LAT = 25.7617;
const LNG = -80.1918;

async function seed(): Promise<void> {
  for (const [id, phone, name] of [
    [HOST,  '+13055559501', 'OpenNightHost'],
    [GUEST, '+13055559502', 'OpenNightGuest'],
  ] as const) {
    await pool.query(
      'INSERT INTO users (id, phone, is_verified) VALUES ($1, $2, true) ON CONFLICT (id) DO NOTHING',
      [id, phone],
    );
    await pool.query(
      `INSERT INTO profiles (id, display_name, age, city, avatar_emoji)
       VALUES ($1, $2, 25, 'Miami', '🦊') ON CONFLICT (id) DO NOTHING`,
      [id, name],
    );
    await pool.query(
      'INSERT INTO trust_scores (user_id, score) VALUES ($1, 70) ON CONFLICT (user_id) DO NOTHING',
      [id],
    );
  }
}

beforeEach(async () => {
  await pool.query('DELETE FROM open_night_requests WHERE TRUE');
  await pool.query('DELETE FROM open_nights WHERE host_user_id = ANY($1)', [ALL]);
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ALL]);
  await seed();
});

afterAll(async () => {
  await pool.query('DELETE FROM open_night_requests WHERE TRUE');
  await pool.query('DELETE FROM open_nights WHERE host_user_id = ANY($1)', [ALL]);
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ALL]);
  await closeDatabase();
  await closeRedis();
});

describe('createOpenNight()', () => {
  it('creates an open night and returns an ID', async () => {
    const { openNightId } = await createOpenNight({
      hostUserId:      HOST,
      duoId:           null,
      venueName:       'The Wynwood Walls Bar',
      headline:        'We have 2 spots at our corner table',
      vibe:            'drinks',
      capacity:        4,
      latitude:        LAT,
      longitude:       LNG,
      durationMinutes: 120,
    });
    expect(openNightId).toBeDefined();
    expect(openNightId).toHaveLength(36); // UUID
  });

  it('validates capacity bounds', async () => {
    await expect(
      createOpenNight({
        hostUserId:      HOST,
        duoId:           null,
        venueName:       'Bar',
        headline:        'Spots available',
        vibe:            'drinks',
        capacity:        1, // below minimum of 2
        durationMinutes: 60,
      }),
    ).rejects.toThrow();
  });
});

describe('getNearbyOpenNights()', () => {
  it('returns the open night within range', async () => {
    await createOpenNight({
      hostUserId:      HOST,
      duoId:           null,
      venueName:       'Test Venue',
      headline:        'Come join us!',
      vibe:            'drinks',
      capacity:        4,
      latitude:        LAT,
      longitude:       LNG,
      durationMinutes: 120,
    });

    const nights = await getNearbyOpenNights({
      latitude:    LAT,
      longitude:   LNG,
      radiusMiles: 5,
    });
    expect(nights.length).toBeGreaterThanOrEqual(1);
    expect(nights[0]!.hostUserId).toBe(HOST);
    expect(nights[0]!.spotsLeft).toBeGreaterThan(0);
  });

  it('does not return full open nights', async () => {
    // Create with capacity 1 (below minimum — won't be created)
    // Instead test with already full night by inserting directly
    const { openNightId } = await createOpenNight({
      hostUserId:      HOST,
      duoId:           null,
      venueName:       'Full Venue',
      headline:        'Table is full',
      vibe:            'drinks',
      capacity:        2,
      latitude:        LAT,
      longitude:       LNG,
      durationMinutes: 120,
    });

    // Mark as full
    await pool.query('UPDATE open_nights SET spots_taken = 2 WHERE id = $1', [openNightId]);

    const nights = await getNearbyOpenNights({ latitude: LAT, longitude: LNG });
    const found = nights.find((n) => n.id === openNightId);
    expect(found).toBeUndefined();
  });
});

describe('requestJoinOpenNight()', () => {
  it('creates a join request and returns a request ID', async () => {
    const { openNightId } = await createOpenNight({
      hostUserId:      HOST,
      duoId:           null,
      venueName:       'Bar',
      headline:        'Join us',
      vibe:            'drinks',
      capacity:        4,
      latitude:        LAT,
      longitude:       LNG,
      durationMinutes: 120,
    });

    const { requestId } = await requestJoinOpenNight({
      openNightId,
      requesterId: GUEST,
      message:     'Would love to join!',
    });
    expect(requestId).toBeDefined();
  });

  it('prevents host from requesting to join their own night', async () => {
    const { openNightId } = await createOpenNight({
      hostUserId:      HOST,
      duoId:           null,
      venueName:       'Bar',
      headline:        'Join us',
      vibe:            'drinks',
      capacity:        4,
      latitude:        LAT,
      longitude:       LNG,
      durationMinutes: 120,
    });

    await expect(
      requestJoinOpenNight({ openNightId, requesterId: HOST }),
    ).rejects.toThrow();
  });
});

describe('respondToJoinRequest()', () => {
  it('accepts a join request and increments spots_taken', async () => {
    const { openNightId } = await createOpenNight({
      hostUserId:      HOST,
      duoId:           null,
      venueName:       'Bar',
      headline:        'Join us',
      vibe:            'drinks',
      capacity:        4,
      latitude:        LAT,
      longitude:       LNG,
      durationMinutes: 120,
    });

    const { requestId } = await requestJoinOpenNight({
      openNightId,
      requesterId: GUEST,
    });

    await respondToJoinRequest({ requestId, hostUserId: HOST, accept: true });

    const { rows } = await pool.query<{ spots_taken: number }>(
      'SELECT spots_taken FROM open_nights WHERE id = $1',
      [openNightId],
    );
    expect(rows[0]!.spots_taken).toBe(2); // 1 host + 1 accepted guest
  });

  it('declines a join request without changing spots_taken', async () => {
    const { openNightId } = await createOpenNight({
      hostUserId:      HOST,
      duoId:           null,
      venueName:       'Bar',
      headline:        'Join us',
      vibe:            'drinks',
      capacity:        4,
      latitude:        LAT,
      longitude:       LNG,
      durationMinutes: 120,
    });

    const { requestId } = await requestJoinOpenNight({
      openNightId,
      requesterId: GUEST,
    });

    await respondToJoinRequest({ requestId, hostUserId: HOST, accept: false });

    const { rows } = await pool.query<{ spots_taken: number }>(
      'SELECT spots_taken FROM open_nights WHERE id = $1',
      [openNightId],
    );
    expect(rows[0]!.spots_taken).toBe(1); // unchanged
  });

  it('throws when non-host tries to respond', async () => {
    const { openNightId } = await createOpenNight({
      hostUserId:      HOST,
      duoId:           null,
      venueName:       'Bar',
      headline:        'Join us',
      vibe:            'drinks',
      capacity:        4,
      latitude:        LAT,
      longitude:       LNG,
      durationMinutes: 120,
    });

    const { requestId } = await requestJoinOpenNight({
      openNightId,
      requesterId: GUEST,
    });

    // GUEST tries to respond to their own request — should fail
    await expect(
      respondToJoinRequest({ requestId, hostUserId: GUEST, accept: true }),
    ).rejects.toThrow();
  });
});
