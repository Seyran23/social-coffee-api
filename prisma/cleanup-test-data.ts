/* eslint-disable no-console */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import Redis from 'ioredis';

dotenv.config();

const prisma = new PrismaClient();

const SEED_VENUE_IDS = [
  'test-venue-seed-id-000001',
  'test-venue-seed-id-000002',
  'test-venue-seed-id-000003',
  'test-venue-seed-id-000004',
  'test-venue-seed-id-000005',
];

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

async function cleanupRedis(userIds: string[]): Promise<void> {
  const redis = createRedisClient();
  try {
    for (const venueId of SEED_VENUE_IDS) {
      await redis.del(`venue:${venueId}:users`);
      await redis.srem('active_venues', venueId);
    }
    for (const userId of userIds) {
      await redis.del(`user:${userId}:venue`);
      await redis.del(`heartbeat:${userId}`);
    }
  } finally {
    await redis.quit();
  }
}

async function main(): Promise<void> {
  const testUsers = await prisma.user.findMany({
    where: { email: { endsWith: '@test.com' } },
    select: { id: true },
  });
  const userIds = testUsers.map(u => u.id);

  await cleanupRedis(userIds);

  // Explicit ordered deletes rather than relying on cascade — Preference
  // has no onDelete rule defined in the schema, so this is the safe path
  // regardless of what the underlying migration actually did.
  await prisma.message.deleteMany({
    where: { chatSession: { venueId: { in: SEED_VENUE_IDS } } },
  });
  await prisma.chatSession.deleteMany({
    where: { venueId: { in: SEED_VENUE_IDS } },
  });
  await prisma.interaction.deleteMany({
    where: { venueId: { in: SEED_VENUE_IDS } },
  });
  await prisma.userInterest.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.preference.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.venue.deleteMany({
    where: { id: { in: SEED_VENUE_IDS } },
  });
  await prisma.user.deleteMany({
    where: { email: { endsWith: '@test.com' } },
  });

  console.log(
    `Removed ${userIds.length} test user(s), ${SEED_VENUE_IDS.length} test venue(s), their chat data, and Redis presence.`,
  );
}

main()
  .catch(e => {
    console.error('Cleanup failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
