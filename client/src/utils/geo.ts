const EARTH_RADIUS_M = 6_371_000;
const METERS_PER_MILE = 1609.34;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance between two coordinates, in metres. */
export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

const FUZZ_GRID_DEG = 0.002;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Snap a coordinate to the nearest ~200m grid (client-side privacy). */
export function applyFuzzyLocation(lat: number, lng: number): { lat: number; lng: number } {
  return {
    lat: round6(Math.round(lat / FUZZ_GRID_DEG) * FUZZ_GRID_DEG),
    lng: round6(Math.round(lng / FUZZ_GRID_DEG) * FUZZ_GRID_DEG),
  };
}

/** Rough coordinates for common Miami neighborhoods (geolocation fallback). */
export const MIAMI_NEIGHBORHOODS: Record<string, { lat: number; lng: number }> = {
  wynwood: { lat: 25.8003, lng: -80.1991 },
  brickell: { lat: 25.7617, lng: -80.1918 },
  'south beach': { lat: 25.7826, lng: -80.134 },
  'little havana': { lat: 25.7657, lng: -80.2196 },
  downtown: { lat: 25.7742, lng: -80.1936 },
  'coral gables': { lat: 25.7215, lng: -80.2684 },
  midtown: { lat: 25.8076, lng: -80.1918 },
};

export function neighborhoodCoords(name: string): { lat: number; lng: number } {
  const key = name.trim().toLowerCase();
  for (const [hood, coords] of Object.entries(MIAMI_NEIGHBORHOODS)) {
    if (key.includes(hood)) return coords;
  }
  return { lat: 25.7617, lng: -80.1918 }; // Miami default
}
