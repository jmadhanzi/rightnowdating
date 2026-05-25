/**
 * Development seed data: 5 real Miami "safe zone" venues, 2 test users (with
 * profiles + trust scores), and a live session for each. Idempotent — safe to
 * run repeatedly (uses fixed UUIDs + ON CONFLICT DO NOTHING).
 *
 * Usage: `npm run db:seed` (from /server) or `tsx src/db/seed.ts`.
 */
import { pool, transaction } from './index.js';
import { logger } from '../utils/logger.js';

interface SeedVenue {
  id: string;
  name: string;
  address: string;
  lng: number;
  lat: number;
  type: 'coffee' | 'bar' | 'restaurant' | 'park' | 'mall' | 'other';
  rating: number;
}

// Real Miami public venues with accurate GPS (lng, lat).
const MIAMI_SAFE_ZONES: SeedVenue[] = [
  {
    id: 'aaaaaaa1-0000-4000-8000-000000000001',
    name: 'Panther Coffee — Wynwood',
    address: '2390 NW 2nd Ave, Miami, FL 33127',
    lng: -80.19937,
    lat: 25.79979,
    type: 'coffee',
    rating: 4.7,
  },
  {
    id: 'aaaaaaa1-0000-4000-8000-000000000002',
    name: 'Bayside Marketplace',
    address: '401 Biscayne Blvd, Miami, FL 33132',
    lng: -80.18656,
    lat: 25.77855,
    type: 'mall',
    rating: 4.5,
  },
  {
    id: 'aaaaaaa1-0000-4000-8000-000000000003',
    name: 'Books & Books — Coral Gables',
    address: '265 Aragon Ave, Coral Gables, FL 33134',
    lng: -80.2591,
    lat: 25.74934,
    type: 'other',
    rating: 4.8,
  },
  {
    id: 'aaaaaaa1-0000-4000-8000-000000000004',
    name: 'Lincoln Road Mall',
    address: 'Lincoln Rd, Miami Beach, FL 33139',
    lng: -80.14,
    lat: 25.79072,
    type: 'mall',
    rating: 4.6,
  },
  {
    id: 'aaaaaaa1-0000-4000-8000-000000000005',
    name: 'Vizcaya Museum & Gardens',
    address: '3251 S Miami Ave, Miami, FL 33129',
    lng: -80.21033,
    lat: 25.74443,
    type: 'park',
    rating: 4.7,
  },
];

interface SeedUser {
  id: string;
  phone: string;
  referralCode: string;
  displayName: string;
  age: number;
  emoji: string;
  bio: string;
  vibes: string[];
  trustScore: number;
  session: {
    id: string;
    lng: number;
    lat: number;
    vibe: string;
    windowMinutes: number;
  };
}

const TEST_USERS: SeedUser[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    phone: '+13055550001',
    referralCode: 'RIGHTNOW1',
    displayName: 'Maya',
    age: 27,
    emoji: '💃',
    bio: 'Wynwood regular. Here for good coffee and better conversation.',
    vibes: ['coffee', 'walk', 'drinks'],
    trustScore: 78,
    session: {
      id: '33333333-3333-4333-8333-333333333333',
      lng: -80.1994,
      lat: 25.7998,
      vibe: 'coffee',
      windowMinutes: 60,
    },
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    phone: '+13055550002',
    referralCode: 'RIGHTNOW2',
    displayName: 'Diego',
    age: 29,
    emoji: '🕺',
    bio: 'Brickell-based. Rooftop bars, late nights, spontaneous plans.',
    vibes: ['drinks', 'late', 'food'],
    trustScore: 71,
    session: {
      id: '44444444-4444-4444-8444-444444444444',
      lng: -80.1918,
      lat: 25.765,
      vibe: 'drinks',
      windowMinutes: 120,
    },
  },
];

// Privacy jitter applied to the displayed pin (~50–80m).
const FUZZ = 0.0006;

async function seed(): Promise<void> {
  await transaction(async (client) => {
    // --- Venues (safe zones) ---
    for (const v of MIAMI_SAFE_ZONES) {
      await client.query(
        `INSERT INTO venues (id, name, address, city, location, venue_type, is_safe_zone, is_active, rating)
         VALUES ($1, $2, $3, 'Miami', ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, true, true, $7)
         ON CONFLICT (id) DO NOTHING`,
        [v.id, v.name, v.address, v.lng, v.lat, v.type, v.rating],
      );
    }
    logger.info(`Seeded ${MIAMI_SAFE_ZONES.length} Miami safe-zone venues.`);

    // --- Users + profiles + trust scores + sessions ---
    for (const u of TEST_USERS) {
      await client.query(
        `INSERT INTO users (id, phone, referral_code, is_verified, verification_tier, last_active)
         VALUES ($1, $2, $3, true, 'phone', NOW())
         ON CONFLICT (id) DO NOTHING`,
        [u.id, u.phone, u.referralCode],
      );

      await client.query(
        `INSERT INTO profiles (id, display_name, age, avatar_emoji, bio, city, preferred_vibes)
         VALUES ($1, $2, $3, $4, $5, 'Miami', $6)
         ON CONFLICT (id) DO NOTHING`,
        [u.id, u.displayName, u.age, u.emoji, u.bio, u.vibes],
      );

      await client.query(
        `INSERT INTO trust_scores (user_id, score, verified_phone, total_dates, average_rating, total_ratings)
         VALUES ($1, $2, true, 3, 4.5, 3)
         ON CONFLICT (user_id) DO NOTHING`,
        [u.id, u.trustScore],
      );

      const s = u.session;
      await client.query(
        `INSERT INTO live_sessions
           (id, user_id, location, fuzzy_location, vibe, window_minutes, expires_at, is_active, radius_miles)
         VALUES (
           $1, $2,
           ST_SetSRID(ST_MakePoint($3, $4), 4326),
           ST_SetSRID(ST_MakePoint($5, $6), 4326),
           $7, $8::int, NOW() + make_interval(mins => $8::int), true, 2.0
         )
         ON CONFLICT (id) DO NOTHING`,
        [s.id, u.id, s.lng, s.lat, s.lng + FUZZ, s.lat - FUZZ, s.vibe, s.windowMinutes],
      );
    }
    logger.info(`Seeded ${TEST_USERS.length} test users with profiles and live sessions.`);
  });
}

seed()
  .then(() => pool.end())
  .catch(async (err) => {
    logger.error({ err }, 'Seed failed');
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
