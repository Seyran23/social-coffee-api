/* eslint-disable no-console */

import * as dotenv from 'dotenv';
import Redis from 'ioredis';

dotenv.config();

const HEARTBEAT_TTL_SECONDS = 300;
const VENUE_PRESENCE_TTL_SECONDS = 3600;
const REFRESH_INTERVAL_MS = 60_000;

function createRedisClient(): Redis {
  const host = process.env.REDIS_HOST ?? 'localhost';
  const isUpstash = host.includes('upstash.io');
  return new Redis({
    host,
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD,
    tls: isUpstash ? {} : undefined,
    maxRetriesPerRequest: 3,
  });
}

async function refreshAllHeartbeats(redis: Redis): Promise<number> {
  const venueIds = await redis.smembers('active_venues');
  let refreshed = 0;

  for (const venueId of venueIds) {
    const userIds = await redis.smembers(`venue:${venueId}:users`);
    for (const userId of userIds) {
      await redis.setex(
        `heartbeat:${userId}`,
        HEARTBEAT_TTL_SECONDS,
        Date.now().toString(),
      );
      await redis.setex(
        `user:${userId}:venue`,
        VENUE_PRESENCE_TTL_SECONDS,
        venueId,
      );
      refreshed += 1;
    }
  }

  return refreshed;
}

async function main() {
  const redis = createRedisClient();
  console.log(
    'Keeping checked-in presence alive — refreshing every 60s. Press Ctrl+C to stop.',
  );

  const tick = async () => {
    const count = await refreshAllHeartbeats(redis);
    console.log(
      `[${new Date().toLocaleTimeString()}] Refreshed heartbeats for ${count} user(s).`,
    );
  };

  await tick();
  const interval = setInterval(() => {
    tick().catch(err => console.error('Heartbeat refresh failed:', err));
  }, REFRESH_INTERVAL_MS);

  process.on('SIGINT', async () => {
    clearInterval(interval);
    await redis.quit();
    console.log('\nStopped. Presence will expire naturally within ~90s.');
    process.exit(0);
  });
}

main();
