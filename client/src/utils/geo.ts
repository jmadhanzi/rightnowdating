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
