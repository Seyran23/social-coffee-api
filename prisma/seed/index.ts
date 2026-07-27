/* eslint-disable no-console */
import { seedAnalytics, seedVenueOwners, MANAGERS } from './analytics';
import { seedChats } from './chats';
import {
  assertNotProduction,
  createRedisClient,
  ME_EMAIL,
  PASSWORD,
  prisma,
  VENUES,
} from './config';
import { seedArmedMatch } from './matches';
import { seedPresence } from './presence';
import { seedUsers } from './users';
import { saveVenueQrCodes, seedVenues } from './venues';

async function getInterestIds(): Promise<Record<string, string>> {
  const interests = await prisma.interest.findMany({
    select: { id: true, name: true },
  });

  if (interests.length === 0) {
    throw new Error(
      'No interests found — the base seed has not run.\n' +
        'Run "npm run db:seed" first (or use "npm run db:seed:dev", which does both).',
    );
  }

  return Object.fromEntries(interests.map(i => [i.name, i.id]));
}

function printSummary(): void {
  console.log(`
Everything is ready. Accounts (password for all: ${PASSWORD}):

  ${ME_EMAIL.padEnd(24)} your driver account — checked in at ${VENUES[0].name},
  ${''.padEnd(24)} with 2 people who already liked you. Like either one to get
  ${''.padEnd(24)} an instant match, then send a message to start the countdown.

  ${MANAGERS[0].email.padEnd(24)} venue dashboard owner for ${VENUES[0].name}
  ${MANAGERS[1].email.padEnd(24)} owns a different venue (use it to verify 403s)

  <name>@test.com          ~40 regular users spread across ${VENUES.length} venues

  admin@socialcoffee.com   admin (password: from ADMIN_PASSWORD in .env)

Next:
  1. npm run db:presence:keepalive   # keep seeded people "present" while testing
  2. npm run start:dev               # start the API
  QR codes for venue check-in: prisma/seed-output/qrcodes/
`);
}

async function main(): Promise<void> {
  assertNotProduction();

  console.log('Seeding development data...\n');

  const redis = createRedisClient();

  try {
    const interests = await getInterestIds();

    await seedVenues();
    await saveVenueQrCodes();

    const emailToId = await seedUsers(interests);
    const venueGroups = await seedPresence(redis, emailToId);
    await seedChats(venueGroups);

    await seedVenueOwners();
    await seedAnalytics();
    await seedArmedMatch(redis);
  } finally {
    await redis.quit();
  }

  printSummary();
}

main()
  .catch(error => {
    console.error('\nDev seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
