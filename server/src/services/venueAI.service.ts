import type { Vibe } from '@rightnow/shared';

export interface VenueForScoring {
  venueType: string | null;
  isSafeZone: boolean;
  rating: number | null;
  distanceMeters: number;
}

const SEARCH_RADIUS_M = 2500;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** How well a single vibe fits a venue type. */
function vibeFit(vibe: Vibe, type: string | null): number {
  if (vibe === 'coffee' && type === 'coffee') return 1;
  if (vibe === 'drinks' && type === 'bar') return 1;
  if (vibe === 'walk' && type === 'park') return 1;
  if (vibe === 'food' && type === 'restaurant') return 1;
  return 0.5;
}

/**
 * Score a venue (0–1) for a specific pair of users, combining vibe fit, trust,
 * proximity, time-of-day suitability, and rating. Returns 0 when a low-trust
 * pair is sent anywhere but a safe zone.
 */
export function scoreVenueForMatch(
  venue: VenueForScoring,
  vibe1: Vibe,
  vibe2: Vibe,
  trustScore1: number,
  trustScore2: number,
  now: Date = new Date(),
): number {
  // Safety gate: a low-trust participant requires a safe-zone venue.
  if ((trustScore1 < 50 || trustScore2 < 50) && !venue.isSafeZone) return 0;

  const vibeScore = (vibeFit(vibe1, venue.venueType) + vibeFit(vibe2, venue.venueType)) / 2;
  const trustScore = clamp01((trustScore1 + trustScore2) / 200);
  const distanceScore = clamp01(1 - venue.distanceMeters / SEARCH_RADIUS_M);
  const ratingScore = clamp01((venue.rating ?? 0) / 5);

  const hour = now.getHours();
  let timeScore = 1;
  if (venue.venueType === 'bar' && hour < 12) timeScore = 0.3;
  else if (venue.venueType === 'park' && hour >= 22) timeScore = 0.4;

  return (
    vibeScore * 0.35 +
    trustScore * 0.25 +
    distanceScore * 0.25 +
    timeScore * 0.1 +
    ratingScore * 0.05
  );
}
