import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractLatLonFromGoogleMaps,
  formatDistance,
  haversineDistance,
  isWithinDistance,
} from '@/modules/venue/utils/map-url.util';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('haversineDistance', () => {
  it('should return ~0 when coordinates are identical', () => {
    const dist = haversineDistance(
      { userLat: 40.7128, userLon: -74.006 },
      { venueLat: 40.7128, venueLon: -74.006 },
    );
    expect(dist).toBe(0);
  });

  it('should return approximately 111195 m for 1 degree latitude difference', () => {
    const dist = haversineDistance(
      { userLat: 0, userLon: 0 },
      { venueLat: 1, venueLon: 0 },
    );
    expect(dist).toBeCloseTo(111195, -2); // within ~100 m
  });

  it('should return a positive distance for different coordinates', () => {
    const dist = haversineDistance(
      { userLat: 48.8566, userLon: 2.3522 },
      { venueLat: 51.5074, venueLon: -0.1278 },
    );
    expect(dist).toBeGreaterThan(0);
  });
});

describe('isWithinDistance', () => {
  const user = { userLat: 40.7128, userLon: -74.006 };
  const nearbyVenue = { venueLat: 40.7138, venueLon: -74.006 }; // ~111 m away
  const farVenue = { venueLat: 41.0, venueLon: -74.006 }; // ~32 km away

  it('should return true when venue is inside the radius', () => {
    expect(isWithinDistance(user, nearbyVenue, 500)).toBe(true);
  });

  it('should return false when venue is outside the radius', () => {
    expect(isWithinDistance(user, farVenue, 500)).toBe(false);
  });

  it('should return true when venue is exactly on the boundary', () => {
    const dist = haversineDistance(user, nearbyVenue);
    expect(isWithinDistance(user, nearbyVenue, dist)).toBe(true);
  });
});

describe('formatDistance', () => {
  it('should format meters below 1000 with "m" suffix', () => {
    expect(formatDistance(250)).toBe('250m');
    expect(formatDistance(999)).toBe('999m');
  });

  it('should format 1000 m as "1.0km"', () => {
    expect(formatDistance(1000)).toBe('1.0km');
  });

  it('should format values above 1000 in kilometres', () => {
    expect(formatDistance(1500)).toBe('1.5km');
    expect(formatDistance(10000)).toBe('10.0km');
  });
});

describe('extractLatLonFromGoogleMaps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should parse coordinates from a URL with @lat,lon pattern', async () => {
    const url = 'https://www.google.com/maps/@48.8566,2.3522,15z';
    const result = await extractLatLonFromGoogleMaps(url);
    expect(result).toEqual({ latitude: 48.8566, longitude: 2.3522 });
  });

  it('should parse coordinates from a URL with ?q=lat,lon pattern', async () => {
    const url = 'https://maps.google.com/?q=51.5074,-0.1278';
    const result = await extractLatLonFromGoogleMaps(url);
    expect(result).toEqual({ latitude: 51.5074, longitude: -0.1278 });
  });

  it('should parse coordinates from a URL with ll=lat,lon pattern', async () => {
    const url = 'https://maps.google.com/?ll=40.7128,-74.0060';
    const result = await extractLatLonFromGoogleMaps(url);
    expect(result).toEqual({ latitude: 40.7128, longitude: -74.006 });
  });

  it('should return null when no coordinates are present and axios response has no coords', async () => {
    const shortUrl = 'https://goo.gl/maps/shortlink';
    mockedAxios.get = vi.fn().mockResolvedValue({
      request: {
        res: { responseUrl: 'https://maps.google.com/no-coords-here' },
      },
    });

    const result = await extractLatLonFromGoogleMaps(shortUrl);
    expect(result).toBeNull();
  });

  it('should follow redirect and parse coordinates from the resolved URL', async () => {
    const shortUrl = 'https://goo.gl/maps/redirected';
    mockedAxios.get = vi.fn().mockResolvedValue({
      request: {
        res: {
          responseUrl: 'https://www.google.com/maps/@34.0522,-118.2437,14z',
        },
      },
    });

    const result = await extractLatLonFromGoogleMaps(shortUrl);
    expect(result).toEqual({ latitude: 34.0522, longitude: -118.2437 });
  });

  it('should return null when axios throws an error', async () => {
    const badUrl = 'https://goo.gl/maps/broken';
    mockedAxios.get = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await extractLatLonFromGoogleMaps(badUrl);
    expect(result).toBeNull();
  });
});
