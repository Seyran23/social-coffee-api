/* eslint-disable no-console */
import { Gender, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const INTEREST_NAMES = [
  'Coffee',
  'Coding',
  'Hiking',
  'Photography',
  'Travel',
  'Foodie',
  'Music',
  'Art',
  'Fitness',
  'Gaming',
  'Reading',
  'Languages',
];

async function seedInterests(): Promise<void> {
  for (const name of INTEREST_NAMES) {
    await prisma.interest.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${INTEREST_NAMES.length} interests`);
}

async function seedAdmin(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.warn('ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin seed');
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: Role.ADMIN },
    create: {
      email: adminEmail,
      passwordHash,
      role: Role.ADMIN,
      firstName: 'Admin',
      lastName: 'User',
      gender: Gender.OTHER,
      bio: '',
      birthDate: new Date('1990-01-01'),
    },
  });

  console.log(`Admin seeded: ${adminEmail}`);
}

async function main(): Promise<void> {
  console.log('Starting seed...');
  await seedInterests();
  await seedAdmin();
  console.log('Seed complete.');
}

main()
  .catch(e => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
