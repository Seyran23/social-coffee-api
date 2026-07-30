import type Redis from 'ioredis';

import { ME_EMAIL, step, VENUES } from './config';

const PEOPLE_PER_VENUE = 8;

/** Redis TTLs used for seeded presence (seconds). */
const VENUE_KEY_TTL = 3600;
const HEARTBEAT_TTL = 300;

/**
 * Mark a user as physically present at a venue, exactly the way
 * VenueService.checkIn does: venue set + active_venues + user->venue key +
 * a fresh heartbeat.
 */
export async function checkInUser(
  redis: Redis,
  userId: string,
  venueId: string,
): Promise<void> {
  await redis.sadd(`venue:${venueId}:users`, userId);
  await redis.sadd('active_venues', venueId);
  await redis.setex(`user:${userId}:venue`, VENUE_KEY_TTL, venueId);
  await redis.setex(
    `heartbeat:${userId}`,
    HEARTBEAT_TTL,
    Date.now().toString(),
  );
}

/**
 * Spread the seeded users across the venues, 8 per venue.
 *
 * ME_EMAIL is deliberately excluded so it stays "outside" and you can walk
 * it in yourself via a QR scan / check-in call.
 *
 * Returns the per-venue user groups so the chat step can pair people who are
 * actually at the same venue.
 */
export async function seedPresence(
  redis: Redis,
  emailToId: Record<string, string>,
): Promise<string[][]> {
  const assignable = Object.keys(emailToId).filter(email => email !== ME_EMAIL);

  const venueGroups: string[][] = [];

  for (let v = 0; v < VENUES.length; v++) {
    const group = assignable
      .slice(v * PEOPLE_PER_VENUE, (v + 1) * PEOPLE_PER_VENUE)
      .map(email => emailToId[email]);

    venueGroups.push(group);

    for (const userId of group) {
      await checkInUser(redis, userId, VENUES[v].id);
    }
  }

  const total = venueGroups.reduce((sum, g) => sum + g.length, 0);
  step(
    `${total} people checked in across ${VENUES.length} venues ` +
      `(heartbeats expire in ~90s — run "npm run db:presence:keepalive" while testing)`,
  );

  return venueGroups;
}
