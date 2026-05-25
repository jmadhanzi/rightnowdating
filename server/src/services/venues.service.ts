import type { Vibe, VenueSuggestion } from '@rightnow/shared';
import { pool } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { calculateMidpoint, haversineMeters } from './location.service.js';
import { suggestVenues as googlePlacesNearby } from './places.service.js';

const SEARCH_RADIUS_M = 2500; // 2.5 km around the midpoint

/** Which venue_type values best fit each vibe. */
const VIBE_VENUE_TYPES: Record<Vibe, string[]> = {
  coffee: ['coffee'],
  drinks: ['bar'],
  food: ['restaurant'],
  walk: ['park'],
  explore: ['park', 'mall', 'other'],
  late: ['bar'],
  spicy: ['bar', 'restaurant'],
};

/** Google Places keyword per vibe (fallback search). */
const VIBE_KEYWORD: Record<Vibe, string> = {
  coffee: 'cafe',
  drinks: 'bar',
  food: 'restaurant',
  walk: 'park',
  explore: 'point of interest',
  late: 'bar',
  spicy: 'cocktail bar',
};

export interface LatLng {
  lat: number;
  lng: number;
}

interface Candidate {
  id: string | null;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  isSafeZone: boolean;
  rating: number;
  venueType: string | null;
}

function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

interface VenueRow {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  dist: number;
  is_safe_zone: boolean;
  rating: number | null;
  venue_type: string | null;
}

async function queryDbVenues(mid: LatLng): Promise<Candidate[]> {
  const { rows } = await pool.query<VenueRow>(
    `SELECT id, name, address,
            ST_Y(location) AS lat,
            ST_X(location) AS lng,
            ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS dist,
            is_safe_zone, rating, venue_type
       FROM venues
      WHERE is_active = true
        AND location IS NOT NULL
        AND ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
      ORDER BY dist ASC
      LIMIT 25`,
    [mid.lng, mid.lat, SEARCH_RADIUS_M],
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    address: r.address,
    lat: Number(r.lat),
    lng: Number(r.lng),
    distanceMeters: Number(r.dist),
    isSafeZone: r.is_safe_zone,
    rating: r.rating === null ? 0 : Number(r.rating),
    venueType: r.venue_type,
  }));
}

async function queryGoogleVenues(mid: LatLng, vibe: Vibe): Promise<Candidate[]> {
  const places = await googlePlacesNearby(mid, VIBE_KEYWORD[vibe], SEARCH_RADIUS_M);
  return places.map((p) => ({
    id: null,
    name: p.name,
    address: p.address,
    lat: p.location.lat,
    lng: p.location.lng,
    distanceMeters: Math.round(haversineMeters(mid.lat, mid.lng, p.location.lat, p.location.lng)),
    isSafeZone: false,
    rating: 0,
    venueType: null,
  }));
}

/** Weighted score: 40% proximity, 40% safe-zone, 20% rating. */
function score(c: Candidate): number {
  const distanceScore = 1 - Math.min(c.distanceMeters / SEARCH_RADIUS_M, 1);
  const safeScore = c.isSafeZone ? 1 : 0;
  const ratingScore = Math.min(c.rating / 5, 1);
  return 0.4 * distanceScore + 0.4 * safeScore + 0.2 * ratingScore;
}

/**
 * Suggest up to 3 meetup venues near the midpoint of two live sessions,
 * preferring venues that match the vibe. Falls back to Google Places when the
 * local catalogue has fewer than 3 candidates.
 */
export async function suggestVenues(
  session1: LatLng,
  session2: LatLng,
  vibe: Vibe,
): Promise<VenueSuggestion[]> {
  const mid = calculateMidpoint(session1.lat, session1.lng, session2.lat, session2.lng);

  const dbVenues = await queryDbVenues(mid);
  const preferredTypes = VIBE_VENUE_TYPES[vibe] ?? [];
  const typeMatched = preferredTypes.length
    ? dbVenues.filter((v) => v.venueType !== null && preferredTypes.includes(v.venueType))
    : dbVenues;

  let candidates = typeMatched.length >= 3 ? typeMatched : dbVenues;

  if (candidates.length < 3) {
    const fromGoogle = await queryGoogleVenues(mid, vibe).catch((err) => {
      logger.warn({ err }, 'Google Places fallback unavailable');
      return [] as Candidate[];
    });
    // De-dupe by name to avoid obvious overlaps with DB results.
    const seen = new Set(candidates.map((c) => c.name.toLowerCase()));
    candidates = [...candidates, ...fromGoogle.filter((c) => !seen.has(c.name.toLowerCase()))];
  }

  return candidates
    .map((c) => ({ candidate: c, value: score(c) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map(({ candidate }) => ({
      id: candidate.id,
      name: candidate.name,
      address: candidate.address,
      distanceMeters: candidate.distanceMeters,
      directionsUrl: directionsUrl(candidate.lat, candidate.lng),
      isSafeZone: candidate.isSafeZone,
    }));
}
