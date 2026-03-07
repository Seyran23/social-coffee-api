import { Gender, LookingFor, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// import { LoggerService } from 'src/common/logger/logger.service';

const prisma = new PrismaClient();
// const logger = new LoggerService('DatabaseSeed');
// const configService = new ConfigService();

async function main() {
  // const adminEmail = configService.getOrThrow<string>('ADMIN_EMAIL');
  // const adminPassword = configService.getOrThrow<string>('ADMIN_PASSWORD');
  //
  // const hashedPassword = await bcrypt.hash(adminPassword, 10);
  //
  // const admin = await prisma.user.upsert({
  //   where: { email: adminEmail },
  //   update: {
  //     role: Role.ADMIN,
  //   },
  //   create: {
  //     email: adminEmail,
  //     passwordHash: hashedPassword,
  //     firstName: 'Admin',
  //     lastName: 'User',
  //     role: Role.ADMIN,
  //     gender: 'OTHER',
  //     bio: 'System Administrator',
  //     birthDate: new Date('1990-01-01'),
  //   },
  // });

  // logger.log(
  //   `Admin user created/updated - Email: ${admin.email}, Role: ${admin.role}, ID: ${admin.id}`,
  // );
  // logger.log('Database seeding completed successfully');

  console.log('🌱 Starting expanded profile seed...');

  // 1. Create or Get Common Interests
  const interestNames = [
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

  const interests: Record<string, string> = {};

  for (const name of interestNames) {
    const interest = await prisma.interest.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    interests[name] = interest.id;
  }

  console.log(`✅ Ensure ${interestNames.length} interests exist`);

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // --- THE "ME" USER ---
  // Male, Born 1995. Looking for Females.
  await prisma.user.upsert({
    where: { email: 'me@test.com' },
    update: {
      bio: 'Software engineer who loves coffee and obscure indie bands.',
    },
    create: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'me@test.com',
      passwordHash,
      gender: Gender.MALE,
      birthDate: new Date('1995-06-15'),
      bio: 'Software engineer who loves coffee and obscure indie bands.',
      profileImageUrl:
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400',
      role: Role.USER,
      preference: {
        create: {
          minAge: 20,
          maxAge: 30,
          preferredGender: Gender.FEMALE, // FIXED: Explicitly Female
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
  });

  // ============================================
  // GROUP 1: EXISTING MATCHES
  // ============================================

  // Sarah: High Match
  await prisma.user.upsert({
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
      profileImageUrl:
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
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
  });

  // Emily: Low Match
  await prisma.user.upsert({
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
      profileImageUrl:
        'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400',
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
  });

  // ============================================
  // GROUP 2: ADDITIONAL PROFILES
  // ============================================

  // Jessica: PERFECT MATCH
  await prisma.user.upsert({
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
      profileImageUrl:
        'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400',
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
  });

  // Hannah: Age Boundary
  await prisma.user.upsert({
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
      profileImageUrl:
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400',
      preference: {
        // FIXED: Changed null to MALE
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
  });

  // Olivia: Interest Match
  await prisma.user.upsert({
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
      profileImageUrl:
        'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=400',
      preference: {
        // FIXED: Changed null to MALE
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
  });

  // Alex: Gender Mismatch
  await prisma.user.upsert({
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
      profileImageUrl:
        'https://images.unsplash.com/photo-1504257432389-52343af06ae3?w=400',
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
  });

  // Lisa: Age Too High
  await prisma.user.upsert({
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
      profileImageUrl:
        'https://images.unsplash.com/photo-1554151228-14d9def656ec?w=400',
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
  });

  // Rachel: No Common Interests
  await prisma.user.upsert({
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
      profileImageUrl:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
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
  });

  // Sam: Gender.OTHER
  await prisma.user.upsert({
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
      profileImageUrl:
        'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=400',
      preference: {
        // FIXED: Changed null to OTHER
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
  });

  // Diana: Just Joined
  await prisma.user.upsert({
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
      profileImageUrl:
        'https://images.unsplash.com/photo-1520813792240-56fc4a37b1a9?w=400',
      preference: {
        // FIXED: Changed null to MALE (Assumption for seed data)
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
  });

  console.log('✅ Seeding completed.');
}

main()
  .catch(e => {
    console.error('Error seeding database', e.stack);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
