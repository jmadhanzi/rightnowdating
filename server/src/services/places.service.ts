import { Client as GoogleMapsClient } from '@googlemaps/google-maps-services-js';
import type { LngLat } from '@rightnow/shared';
import { env } from '../utils/env.js';

const client = new GoogleMapsClient({});

/** Suggest nearby venues (cafes, bars) for a meetup around a point. */
export async function suggestVenues(
  center: LngLat,
  keyword = 'cafe',
  radiusMeters = 800,
): Promise<{ name: string; address: string; location: LngLat }[]> {
  if (!env.GOOGLE_PLACES_API_KEY) {
    throw new Error('Google Places is not configured (missing API key)');
  }

  const { data } = await client.placesNearby({
    params: {
      key: env.GOOGLE_PLACES_API_KEY,
      location: { lat: center.lat, lng: center.lng },
      radius: radiusMeters,
      keyword,
    },
  });

  return data.results.map((r) => ({
    name: r.name ?? 'Unknown',
    address: r.vicinity ?? '',
    location: {
      lat: r.geometry?.location.lat ?? center.lat,
      lng: r.geometry?.location.lng ?? center.lng,
    },
  }));
}
