/* eslint-disable no-console */

import {
  Gender,
  LookingFor,
  PrismaClient,
  Role,
  VenueStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const PASSWORD = 'Password123!';

async function getInterestIds(): Promise<Record<string, string>> {
  const interests = await prisma.interest.findMany({
    select: { id: true, name: true },
  });
  if (interests.length === 0) {
    throw new Error('No interests found. Run npm run db:seed first.');
  }
  return Object.fromEntries(interests.map(i => [i.name, i.id]));
}

async function seedTestVenue(): Promise<void> {
  await prisma.venue.upsert({
    where: { id: 'test-venue-seed-id-000001' },
    update: {},
    create: {
      id: 'test-venue-seed-id-000001',
      name: 'The Dev Café',
      mapUrl: 'https://maps.google.com/?q=51.5074,-0.1278',
      latitude: 51.5074,
      longitude: -0.1278,
      geofenceMeters: 150,
      status: VenueStatus.ACTIVE,
    },
  });
  console.log('Test venue seeded: The Dev Café');
}

async function seedTestUsers(interests: Record<string, string>): Promise<void> {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const users: Array<Parameters<typeof prisma.user.upsert>[0]> = [
    {
      where: { email: 'me@test.com' },
      update: {},
      create: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'me@test.com',
        passwordHash,
        gender: Gender.MALE,
        birthDate: new Date('1995-06-15'),
        bio: 'Software engineer who loves coffee and obscure indie bands.',
        role: Role.USER,
        preference: {
          create: {
            minAge: 20,
            maxAge: 30,
            preferredGender: Gender.FEMALE,
            lookingFor: [
              LookingFor.ROMANTIC_RELATIONSHIP,
              LookingFor.COFFEE_CHAT,
            ],
          },
        },
        userInterests: {
          create: [
            { interestId: interests['Coffee'] },
            { interestId: interests['Coding'] },
            { interestId: interests['Music'] },
          ],
        },
      },
    },
    {
      where: { email: 'sarah@test.com' },
      update: {},
      create: {
        firstName: 'Sarah',
        lastName: 'Smith',
        email: 'sarah@test.com',
        passwordHash,
        gender: Gender.FEMALE,
        birthDate: new Date('1997-03-22'),
        bio: 'Barista by day, artist by night.',
        preference: {
          create: {
            minAge: 25,
            maxAge: 35,
            preferredGender: Gender.MALE,
            lookingFor: [LookingFor.ROMANTIC_RELATIONSHIP],
          },
        },
        userInterests: {
          create: [
            { interestId: interests['Coffee'] },
            { interestId: interests['Music'] },
            { interestId: interests['Art'] },
          ],
        },
      },
    },
    {
      where: { email: 'jessica@test.com' },
      update: {},
      create: {
        firstName: 'Jessica',
        lastName: 'Chen',
        email: 'jessica@test.com',
        passwordHash,
        gender: Gender.FEMALE,
        birthDate: new Date('1996-08-10'),
        bio: 'Full stack dev. Coffee addict. Vinyl collector.',
        preference: {
          create: {
            minAge: 25,
            maxAge: 35,
            preferredGender: Gender.MALE,
            lookingFor: [LookingFor.COFFEE_CHAT],
          },
        },
        userInterests: {
          create: [
            { interestId: interests['Coding'] },
            { interestId: interests['Coffee'] },
            { interestId: interests['Music'] },
            { interestId: interests['Gaming'] },
          ],
        },
      },
    },
    {
      where: { email: 'emily@test.com' },
      update: {},
      create: {
        firstName: 'Emily',
        lastName: 'Jones',
        email: 'emily@test.com',
        passwordHash,
        gender: Gender.FEMALE,
        birthDate: new Date('2001-11-05'),
        bio: 'Just here to make friends and travel.',
        preference: {
          create: {
            minAge: 20,
            maxAge: 30,
            preferredGender: Gender.MALE,
            lookingFor: [LookingFor.FRIENDSHIP],
          },
        },
        userInterests: {
          create: [
            { interestId: interests['Travel'] },
            { interestId: interests['Hiking'] },
          ],
        },
      },
    },
    {
      where: { email: 'hannah@test.com' },
      update: {},
      create: {
        firstName: 'Hannah',
        lastName: 'Montana',
        email: 'hannah@test.com',
        passwordHash,
        gender: Gender.FEMALE,
        birthDate: new Date('2004-01-01'),
        bio: 'Student looking for study buddies.',
        preference: {
          create: {
            minAge: 18,
            maxAge: 25,
            preferredGender: Gender.MALE,
            lookingFor: [LookingFor.STUDY_BUDDY],
          },
        },
        userInterests: {
          create: [
            { interestId: interests['Reading'] },
            { interestId: interests['Coffee'] },
          ],
        },
      },
    },
    {
      where: { email: 'olivia@test.com' },
      update: {},
      create: {
        firstName: 'Olivia',
        lastName: 'Rodrigo',
        email: 'olivia@test.com',
        passwordHash,
        gender: Gender.FEMALE,
        birthDate: new Date('1993-02-20'),
        bio: 'Photographer exploring the city.',
        preference: {
          create: {
            minAge: 25,
            maxAge: 40,
            preferredGender: Gender.MALE,
            lookingFor: [LookingFor.FRIENDSHIP],
          },
        },
        userInterests: {
          create: [
            { interestId: interests['Photography'] },
            { interestId: interests['Art'] },
          ],
        },
      },
    },
    {
      where: { email: 'alex@test.com' },
      update: {},
      create: {
        firstName: 'Alex',
        lastName: 'Turner',
        email: 'alex@test.com',
        passwordHash,
        gender: Gender.MALE,
        birthDate: new Date('1995-01-06'),
        bio: 'Rockstar life. Love guitars and hair gel.',
        preference: {
          create: {
            minAge: 20,
            maxAge: 30,
            preferredGender: Gender.FEMALE,
            lookingFor: [LookingFor.CASUAL_DATING],
          },
        },
        userInterests: {
          create: [
            { interestId: interests['Music'] },
            { interestId: interests['Coffee'] },
          ],
        },
      },
    },
    {
      where: { email: 'lisa@test.com' },
      update: {},
      create: {
        firstName: 'Lisa',
        lastName: 'Kudrow',
        email: 'lisa@test.com',
        passwordHash,
        gender: Gender.FEMALE,
        birthDate: new Date('1985-07-30'),
        bio: 'Love smelly cats and guitars.',
        preference: {
          create: {
            minAge: 30,
            maxAge: 50,
            preferredGender: Gender.MALE,
            lookingFor: [LookingFor.FRIENDSHIP],
          },
        },
        userInterests: {
          create: [
            { interestId: interests['Music'] },
            { interestId: interests['Foodie'] },
          ],
        },
      },
    },
    {
      where: { email: 'rachel@test.com' },
      update: {},
      create: {
        firstName: 'Rachel',
        lastName: 'Green',
        email: 'rachel@test.com',
        passwordHash,
        gender: Gender.FEMALE,
        birthDate: new Date('1998-05-05'),
        bio: 'Gym rat. FPS gamer.',
        preference: {
          create: {
            minAge: 20,
            maxAge: 30,
            preferredGender: Gender.MALE,
            lookingFor: [LookingFor.ACTIVITY_PARTNER],
          },
        },
        userInterests: {
          create: [
            { interestId: interests['Fitness'] },
            { interestId: interests['Gaming'] },
          ],
        },
      },
    },
    {
      where: { email: 'sam@test.com' },
      update: {},
      create: {
        firstName: 'Sam',
        lastName: 'Smith',
        email: 'sam@test.com',
        passwordHash,
        gender: Gender.OTHER,
        birthDate: new Date('1996-05-19'),
        bio: 'Just being me.',
        preference: {
          create: {
            minAge: 20,
            maxAge: 30,
            preferredGender: Gender.OTHER,
            lookingFor: [LookingFor.FRIENDSHIP],
          },
        },
        userInterests: {
          create: [
            { interestId: interests['Art'] },
            { interestId: interests['Music'] },
          ],
        },
      },
    },
    {
      where: { email: 'diana@test.com' },
      update: {},
      create: {
        firstName: 'Diana',
        lastName: 'Prince',
        email: 'diana@test.com',
        passwordHash,
        gender: Gender.FEMALE,
        birthDate: new Date('1999-03-22'),
        bio: 'New here!',
        preference: {
          create: {
            minAge: 18,
            maxAge: 99,
            preferredGender: Gender.MALE,
            lookingFor: [],
          },
        },
        userInterests: {
          create: [{ interestId: interests['Travel'] }],
        },
      },
    },
  ];

  for (const args of users) {
    await prisma.user.upsert(args);
  }

  console.log(`Seeded ${users.length} test users (password: ${PASSWORD})`);
}

async function main(): Promise<void> {
  console.log('Starting dev seed...');
  const interests = await getInterestIds();
  await seedTestVenue();
  await seedTestUsers(interests);
  console.log('Dev seed complete.');
}

main()
  .catch(e => {
    console.error('Dev seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
