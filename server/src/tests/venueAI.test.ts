import { describe, expect, it } from '@jest/globals';
import { scoreVenueForMatch, type VenueForScoring } from '../services/venueAI.service.js';

const base: VenueForScoring = {
  venueType: 'coffee',
  isSafeZone: true,
  rating: 5,
  distanceMeters: 0,
};
// Fixed afternoon time so time-of-day rules don't interfere.
const noon = new Date('2026-01-01T13:00:00');

describe('scoreVenueForMatch', () => {
  it('scores a perfect coffee match near 1', () => {
    const score = scoreVenueForMatch(base, 'coffee', 'coffee', 80, 80, noon);
    // vibe 1*0.35 + trust 0.8*0.25 + distance 1*0.25 + time 1*0.1 + rating 1*0.05 = 0.95
    expect(score).toBeCloseTo(0.95, 5);
  });

  it('zeroes a low-trust pair outside a safe zone', () => {
    const unsafe = { ...base, isSafeZone: false };
    expect(scoreVenueForMatch(unsafe, 'coffee', 'coffee', 40, 80, noon)).toBe(0);
  });

  it('allows a low-trust pair in a safe zone', () => {
    expect(scoreVenueForMatch(base, 'coffee', 'coffee', 40, 80, noon)).toBeGreaterThan(0);
  });

  it('penalizes a bar before noon', () => {
    const bar: VenueForScoring = { ...base, venueType: 'bar' };
    const morning = new Date('2026-01-01T09:00:00');
    const afternoon = scoreVenueForMatch(bar, 'drinks', 'drinks', 80, 80, noon);
    const beforeNoon = scoreVenueForMatch(bar, 'drinks', 'drinks', 80, 80, morning);
    expect(beforeNoon).toBeLessThan(afternoon);
  });

  it('drops with distance', () => {
    const far = { ...base, distanceMeters: 2500 };
    const near = scoreVenueForMatch(base, 'coffee', 'coffee', 80, 80, noon);
    expect(scoreVenueForMatch(far, 'coffee', 'coffee', 80, 80, noon)).toBeLessThan(near);
  });

  it('gives mismatched vibes a lower vibe component', () => {
    const matched = scoreVenueForMatch(base, 'coffee', 'coffee', 80, 80, noon);
    const mismatched = scoreVenueForMatch(base, 'drinks', 'food', 80, 80, noon);
    expect(mismatched).toBeLessThan(matched);
  });
});
