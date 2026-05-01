import { Logger } from '@nestjs/common';
import axios from 'axios';

import { MAP_URL_PATTERNS } from '@/modules/venue/constants/map-url-patterns';
import { Coordinates } from '@/modules/venue/interfaces/coordinates.interface';
import { UserCoordinates } from '@/modules/venue/interfaces/user-coordinates.interface';
import { VenueCoordinates } from '@/modules/venue/interfaces/venue-coordinates.interface';

const logger = new Logger('MapUrlUtil');

//Calculate a distance between two coordinates using Haversine formula
export function haversineDistance(
  { userLat, userLon }: UserCoordinates,
  { venueLat, venueLon }: VenueCoordinates,
): number {
  const R = 6371e3; // radius of Earth in meters
  const toRad = (deg: number): number => (deg * Math.PI) / 180;

  const dLat = toRad(venueLat - userLat);
  const dLon = toRad(venueLon - userLon);

  const lat1 = toRad(userLat);
  const lat2 = toRad(venueLat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h)); // distance in meters
}

function parseUrlDirect(url: string): Coordinates | null {
  for (const regex of MAP_URL_PATTERNS) {
    const match = url.match(regex);
    if (match) {
      const latitude = parseFloat(match[1]);
      const longitude = parseFloat(match[2]);
      if (
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180
      ) {
        return { latitude, longitude };
      }
    }
  }
  return null;
}

export async function extractLatLonFromGoogleMaps(
  url: string,
): Promise<Coordinates | null> {
  // Try parsing coordinates directly from the URL before making a network request.
  // URLs like ?q=lat,lon or @lat,lon contain coordinates without needing to fetch.
  const direct = parseUrlDirect(url);
  if (direct) {
    return direct;
  }

  try {
    const response = await axios.get(url, {
      maxRedirects: 5,
      timeout: 5000,
      validateStatus: () => true,
    });

    const finalUrl = response.request?.res?.responseUrl ?? url;

    const fromFinal = parseUrlDirect(finalUrl);
    if (fromFinal) {
      return fromFinal;
    }

    return null;
  } catch (err) {
    logger.error(`Failed to parse Google Maps link: ${(err as Error).message}`);
    return null;
  }
}

export function isWithinDistance(
  userCoords: UserCoordinates,
  venueCoords: VenueCoordinates,
  maxDistanceMeters: number,
): boolean {
  const distance = haversineDistance(userCoords, venueCoords);
  return distance <= maxDistanceMeters;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}
