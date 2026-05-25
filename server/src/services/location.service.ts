import type { Vibe } from '@rightnow/shared';
import { pool } from '../db/index.js';

const MILES_TO_METERS = 1609.34;
const EARTH_RADIUS_M = 6_371_000;

/** Fuzzing grid size in degrees (~200 m). */
const FUZZ_GRID_DEG = 0.002;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

export interface FuzzyLocation {
  fuzzyLat: number;
  fuzzyLng: number;
}

export interface NearbyUser {
  sessionId: string;
  fuzzyLat: number;
  fuzzyLng: number;
  vibe: Vibe;
  trustScore: number;
  displayName: string;
  age: number | null;
  emoji: string;
}

/**
 * Snap coordinates to the nearest ~200 m grid cell. Exact GPS is never stored
 * or returned — only the snapped point.
 */
export function applyFuzzyLocation(lat: number, lng: number): FuzzyLocation {
  return {
    fuzzyLat: round6(Math.round(lat / FUZZ_GRID_DEG) * FUZZ_GRID_DEG),
    fuzzyLng: round6(Math.round(lng / FUZZ_GRID_DEG) * FUZZ_GRID_DEG),
  };
}

/** Great-circle distance between two points, in metres. */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Geographic midpoint between two (fuzzy) coordinates. */
export function calculateMidpoint(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): { lat: number; lng: number } {
  const lat1r = toRad(lat1);
  const lat2r = toRad(lat2);
  const lng1r = toRad(lng1);
  const dLng = toRad(lng2 - lng1);

  const bx = Math.cos(lat2r) * Math.cos(dLng);
  const by = Math.cos(lat2r) * Math.sin(dLng);

  const lat = Math.atan2(
    Math.sin(lat1r) + Math.sin(lat2r),
    Math.sqrt((Math.cos(lat1r) + bx) ** 2 + by ** 2),
  );
  const lng = lng1r + Math.atan2(by, Math.cos(lat1r) + bx);

  return { lat: round6(toDeg(lat)), lng: round6(toDeg(lng)) };
}

interface NearbyRow {
  id: string;
  lat: number;
  lng: number;
  vibe: Vibe;
  trust: number;
  display_name: string;
  age: number | null;
  emoji: string;
}

/**
 * Active live sessions within `radiusMiles` of a point, excluding `userId`.
 * Queries the fuzzy location only — exact coordinates are never selected.
 */
export async function getNearbyUsers(
  lat: number,
  lng: number,
  radiusMiles: number,
  userId: string,
  vibe?: Vibe,
): Promise<NearbyUser[]> {
  const radiusMeters = radiusMiles * MILES_TO_METERS;

  const { rows } = await pool.query<NearbyRow>(
    `SELECT ls.id,
            ST_Y(ls.fuzzy_location) AS lat,
            ST_X(ls.fuzzy_location) AS lng,
            ls.vibe,
            COALESCE(ts.score, 50) AS trust,
            p.display_name,
            p.age,
            p.avatar_emoji AS emoji
       FROM live_sessions ls
       JOIN profiles p ON p.id = ls.user_id
       LEFT JOIN trust_scores ts ON ts.user_id = ls.user_id
      WHERE ls.is_active = true
        AND ls.expires_at > NOW()
        AND ls.user_id <> $1
        AND ($2::text IS NULL OR ls.vibe = $2)
        AND ST_DWithin(
              ls.fuzzy_location::geography,
              ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
              $5
            )
      ORDER BY ls.fuzzy_location <-> ST_SetSRID(ST_MakePoint($3, $4), 4326)
      LIMIT 200`,
    [userId, vibe ?? null, lng, lat, radiusMeters],
  );

  return rows.map((r) => ({
    sessionId: r.id,
    fuzzyLat: Number(r.lat),
    fuzzyLng: Number(r.lng),
    vibe: r.vibe,
    trustScore: Number(r.trust),
    displayName: r.display_name,
    age: r.age === null ? null : Number(r.age),
    emoji: r.emoji,
  }));
}
