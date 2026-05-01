import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Truncates all user-data tables in the correct dependency order.
 * Call this in beforeEach / afterEach to guarantee test isolation.
 *
 * Venue and admin seed data are NOT cleared here — use clearAll() for full reset.
 */
export async function clearUserData(): Promise<void> {
  await prisma.$transaction([
    prisma.token.deleteMany(),
    prisma.interaction.deleteMany(),
    prisma.message.deleteMany(),
    prisma.chatSession.deleteMany(),
    prisma.preference.deleteMany(),
    prisma.userInterest.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

/**
 * Clears ALL test data including venues. Use in final afterAll.
 */
export async function clearAll(): Promise<void> {
  await prisma.$transaction([
    prisma.token.deleteMany(),
    prisma.interaction.deleteMany(),
    prisma.message.deleteMany(),
    prisma.chatSession.deleteMany(),
    prisma.preference.deleteMany(),
    prisma.userInterest.deleteMany(),
    prisma.user.deleteMany(),
    prisma.venue.deleteMany(),
  ]);
}

/**
 * Disconnect Prisma client. Call once in the global afterAll.
 */
export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}

export { prisma };
