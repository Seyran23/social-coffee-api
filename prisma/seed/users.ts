import { Gender, LookingFor, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { avatarUrl, ME_EMAIL, PASSWORD, prisma, step } from './config';

// Hand-written profiles — kept as-is. ME_EMAIL is intentionally left
// unassigned to any venue below so you can check it in yourself via a real
// QR scan and see everyone else already there.
function handWrittenUsers(
  interests: Record<string, string>,
  passwordHash: string,
): Array<Parameters<typeof prisma.user.upsert>[0]> {
  return [
    {
      where: { email: ME_EMAIL },
      // Not overwritten on update: this account is meant for you to test the
      // real profile-photo upload flow (and forgot-password with a real inbox)
      // against, so a re-seed shouldn't clobber whatever you've uploaded/changed.
      update: {},
      create: {
        firstName: 'John',
        lastName: 'Doe',
        email: ME_EMAIL,
        passwordHash,
        gender: Gender.MALE,
        birthDate: new Date('1995-06-15'),
        profileImageUrl: avatarUrl(Gender.MALE, 0),
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
      update: { profileImageUrl: avatarUrl(Gender.FEMALE, 0) },
      create: {
        firstName: 'Sarah',
        lastName: 'Smith',
        email: 'sarah@test.com',
        passwordHash,
        gender: Gender.FEMALE,
        birthDate: new Date('1997-03-22'),
        profileImageUrl: avatarUrl(Gender.FEMALE, 0),
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
      update: { profileImageUrl: avatarUrl(Gender.FEMALE, 1) },
      create: {
        firstName: 'Jessica',
        lastName: 'Chen',
        email: 'jessica@test.com',
        passwordHash,
        gender: Gender.FEMALE,
        birthDate: new Date('1996-08-10'),
        profileImageUrl: avatarUrl(Gender.FEMALE, 1),
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
      update: { profileImageUrl: avatarUrl(Gender.FEMALE, 2) },
      create: {
        firstName: 'Emily',
        lastName: 'Jones',
        email: 'emily@test.com',
        passwordHash,
        gender: Gender.FEMALE,
        birthDate: new Date('2001-11-05'),
        profileImageUrl: avatarUrl(Gender.FEMALE, 2),
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
      update: { profileImageUrl: avatarUrl(Gender.FEMALE, 3) },
      create: {
        firstName: 'Hannah',
        lastName: 'Montana',
        email: 'hannah@test.com',
        passwordHash,
        gender: Gender.FEMALE,
        birthDate: new Date('2004-01-01'),
        profileImageUrl: avatarUrl(Gender.FEMALE, 3),
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
      update: { profileImageUrl: avatarUrl(Gender.FEMALE, 4) },
      create: {
        firstName: 'Olivia',
        lastName: 'Rodrigo',
        email: 'olivia@test.com',
        passwordHash,
        gender: Gender.FEMALE,
        birthDate: new Date('1993-02-20'),
        profileImageUrl: avatarUrl(Gender.FEMALE, 4),
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
      update: { profileImageUrl: avatarUrl(Gender.MALE, 1) },
      create: {
        firstName: 'Alex',
        lastName: 'Turner',
        email: 'alex@test.com',
        passwordHash,
        gender: Gender.MALE,
        birthDate: new Date('1995-01-06'),
        profileImageUrl: avatarUrl(Gender.MALE, 1),
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
      update: { profileImageUrl: avatarUrl(Gender.FEMALE, 5) },
      create: {
        firstName: 'Lisa',
        lastName: 'Kudrow',
        email: 'lisa@test.com',
        passwordHash,
        gender: Gender.FEMALE,
        birthDate: new Date('1985-07-30'),
        profileImageUrl: avatarUrl(Gender.FEMALE, 5),
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
      update: { profileImageUrl: avatarUrl(Gender.FEMALE, 6) },
      create: {
        firstName: 'Rachel',
        lastName: 'Green',
        email: 'rachel@test.com',
        passwordHash,
        gender: Gender.FEMALE,
        birthDate: new Date('1998-05-05'),
        profileImageUrl: avatarUrl(Gender.FEMALE, 6),
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
      update: { profileImageUrl: avatarUrl(Gender.OTHER, 0) },
      create: {
        firstName: 'Sam',
        lastName: 'Smith',
        email: 'sam@test.com',
        passwordHash,
        gender: Gender.OTHER,
        birthDate: new Date('1996-05-19'),
        profileImageUrl: avatarUrl(Gender.OTHER, 0),
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
      update: { profileImageUrl: avatarUrl(Gender.FEMALE, 7) },
      create: {
        firstName: 'Diana',
        lastName: 'Prince',
        email: 'diana@test.com',
        passwordHash,
        gender: Gender.FEMALE,
        birthDate: new Date('1999-03-22'),
        profileImageUrl: avatarUrl(Gender.FEMALE, 7),
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
}

// Names/bios below are just a pool to combine, not literal one-off profiles —
// this generates realistic-but-varied filler people so 5 venues can each
// have a full crowd without hand-writing dozens of near-identical blocks.
const GENERATED_PEOPLE: Array<{ name: string; gender: Gender }> = [
  { name: 'Marcus', gender: Gender.MALE },
  { name: 'Daniel', gender: Gender.MALE },
  { name: 'Ethan', gender: Gender.MALE },
  { name: 'Noah', gender: Gender.MALE },
  { name: 'Lucas', gender: Gender.MALE },
  { name: 'Ryan', gender: Gender.MALE },
  { name: 'Adam', gender: Gender.MALE },
  { name: 'Kevin', gender: Gender.MALE },
  { name: 'Tomas', gender: Gender.MALE },
  { name: 'Felix', gender: Gender.MALE },
  { name: 'Grace', gender: Gender.FEMALE },
  { name: 'Nina', gender: Gender.FEMALE },
  { name: 'Chloe', gender: Gender.FEMALE },
  { name: 'Ava', gender: Gender.FEMALE },
  { name: 'Zoe', gender: Gender.FEMALE },
  { name: 'Mia', gender: Gender.FEMALE },
  { name: 'Ella', gender: Gender.FEMALE },
  { name: 'Sofia', gender: Gender.FEMALE },
  { name: 'Lily', gender: Gender.FEMALE },
  { name: 'Anna', gender: Gender.FEMALE },
  { name: 'Robin', gender: Gender.OTHER },
  { name: 'Jordan', gender: Gender.OTHER },
  { name: 'Taylor', gender: Gender.OTHER },
];

const GENERATED_LAST_NAMES = [
  'Walker',
  'Bennett',
  'Hughes',
  'Foster',
  'Reed',
  'Cole',
  'Brooks',
  'Ward',
  'Bailey',
  'Price',
];

const GENERATED_BIOS = [
  'Always chasing the next great espresso.',
  'Here for good conversation and better coffee.',
  'Remote worker, professional people-watcher.',
  'New in town, looking to meet locals.',
  'Coffee snob in recovery. Ask me about pour-overs.',
  'Weekend hiker, weekday desk jockey.',
  'Trying every café in the city, one cup at a time.',
  'Bookworm who needed an excuse to leave the house.',
  'Between meetings, always up for a chat.',
  'Plant parent, coffee enthusiast, occasional gamer.',
];

const LOOKING_FOR_VALUES = Object.values(LookingFor);
const PREFERRED_GENDERS = [Gender.MALE, Gender.FEMALE, Gender.OTHER];

function generatedUsers(
  count: number,
  interests: Record<string, string>,
  passwordHash: string,
): Array<Parameters<typeof prisma.user.upsert>[0]> {
  const interestNames = Object.keys(interests);

  return Array.from({ length: count }, (_, i) => {
    const person = GENERATED_PEOPLE[i % GENERATED_PEOPLE.length];
    const lastName =
      GENERATED_LAST_NAMES[(i * 3) % GENERATED_LAST_NAMES.length];
    const age = 19 + (i % 27);
    const birthDate = new Date(2026 - age, i % 12, (i % 27) + 1);
    const email = `${person.name.toLowerCase()}${i}@test.com`;

    const pickedInterests = [
      interestNames[i % interestNames.length],
      interestNames[(i + 4) % interestNames.length],
      interestNames[(i + 8) % interestNames.length],
    ];

    return {
      where: { email },
      update: { profileImageUrl: avatarUrl(person.gender, i) },
      create: {
        firstName: person.name,
        lastName,
        email,
        passwordHash,
        gender: person.gender,
        birthDate,
        profileImageUrl: avatarUrl(person.gender, i),
        bio: GENERATED_BIOS[i % GENERATED_BIOS.length],
        role: Role.USER,
        preference: {
          create: {
            minAge: Math.max(18, age - 6),
            maxAge: age + 8,
            preferredGender: PREFERRED_GENDERS[i % PREFERRED_GENDERS.length],
            lookingFor: [
              LOOKING_FOR_VALUES[i % LOOKING_FOR_VALUES.length],
              LOOKING_FOR_VALUES[(i + 3) % LOOKING_FOR_VALUES.length],
            ],
          },
        },
        userInterests: {
          create: pickedInterests.map(name => ({
            interestId: interests[name],
          })),
        },
      },
    };
  });
}
/**
 * Create every test account. Returns an email -> id map the later steps use to
 * decide who is checked in where.
 */
export async function seedUsers(
  interests: Record<string, string>,
): Promise<Record<string, string>> {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const allUsers = [
    ...handWrittenUsers(interests, passwordHash),
    ...generatedUsers(30, interests, passwordHash),
  ];

  const emailToId: Record<string, string> = {};
  for (const args of allUsers) {
    const user = await prisma.user.upsert(args);
    emailToId[user.email] = user.id;
  }

  step(`${allUsers.length} test users (password: ${PASSWORD})`);
  return emailToId;
}
