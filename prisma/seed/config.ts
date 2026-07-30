/* eslint-disable no-console */
import { Gender, PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import Redis from 'ioredis';

dotenv.config();

/** Shared Prisma client for every seed module. */
export const prisma = new PrismaClient();

/** Password every seeded test account shares. */
export const PASSWORD = 'Password123!';

/**
 * Baku, Azerbaijan — centered on Gloria Jean's Coffees, so the seeded venues
 * show up in the nearby-venues map regardless of exactly where you're standing
 * while testing.
 */
export const CENTER = { latitude: 40.3679981, longitude: 49.8386752 };

export const VENUES = [
  {
    id: 'test-venue-seed-id-000001',
    name: "Gloria Jean's Coffees",
    latOffset: 0,
    lonOffset: 0,
  },
  {
    id: 'test-venue-seed-id-000002',
    name: 'Nizami Coffee House',
    latOffset: 0.006,
    lonOffset: -0.004,
  },
  {
    id: 'test-venue-seed-id-000003',
    name: 'Baku Bay Roasters',
    latOffset: -0.008,
    lonOffset: 0.005,
  },
  {
    id: 'test-venue-seed-id-000004',
    name: 'Fountain Square Brew',
    latOffset: 0.003,
    lonOffset: 0.009,
  },
  {
    id: 'test-venue-seed-id-000005',
    name: 'Icherisheher Espresso Bar',
    latOffset: -0.005,
    lonOffset: -0.007,
  },
] as const;

/** The venue used for the analytics dashboard demo and the armed match. */
export const DEMO_VENUE_ID = VENUES[0].id;

/**
 * The account reserved for you to drive manually. It is deliberately NOT
 * checked in by the presence step, so you can scan a QR yourself and see the
 * crowd already there.
 */
export const ME_EMAIL = 'seyranm230@gmail.com';

export const DAY_MS = 24 * 60 * 60 * 1000;

const MALE_AVATAR_COUNT = 100;
const FEMALE_AVATAR_COUNT = 100;
const NEUTRAL_AVATAR_COUNT = 10;

/**
 * Deterministic, gender-appropriate placeholder photo (randomuser.me's static
 * portrait sets — stable URLs, no API key) so seeded profiles show a real-
 * looking face instead of every user sharing one generic avatar.
 */
export function avatarUrl(gender: Gender, index: number): string {
  switch (gender) {
    case Gender.MALE:
      return `https://randomuser.me/api/portraits/men/${index % MALE_AVATAR_COUNT}.jpg`;
    case Gender.FEMALE:
      return `https://randomuser.me/api/portraits/women/${index % FEMALE_AVATAR_COUNT}.jpg`;
    default:
      return `https://randomuser.me/api/portraits/lego/${index % NEUTRAL_AVATAR_COUNT}.jpg`;
  }
}

export function createRedisClient(): Redis {
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

/**
 * Seeding writes fake users into Redis presence and wipes/rewrites demo
 * analytics rows, so it must never run against production infrastructure.
 */
export function assertNotProduction(): void {
  const nodeEnv = process.env.NODE_ENV;
  const redisHost = process.env.REDIS_HOST ?? 'localhost';

  if (nodeEnv === 'production') {
    throw new Error(
      'Refusing to seed: NODE_ENV=production. Seeding is for development only.',
    );
  }

  if (redisHost.includes('upstash.io')) {
    throw new Error(
      `Refusing to seed: REDIS_HOST points at a hosted Redis (${redisHost}).\n` +
        'Point REDIS_HOST at a local Redis before seeding.',
    );
  }
}

/** Marks a step's output in the console so the run reads as a checklist. */
export function step(message: string): void {
  console.log(`  ✓ ${message}`);
}
