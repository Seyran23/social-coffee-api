import { Gender, InteractionType, LookingFor, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type Redis from 'ioredis';

import {
  avatarUrl,
  DAY_MS,
  DEMO_VENUE_ID,
  ME_EMAIL,
  PASSWORD,
  prisma,
  step,
} from './config';
import { checkInUser } from './presence';

/**
 * Women who match me@test.com's stated preference (FEMALE, 20-30) and who have
 * ALREADY liked that account — so liking either of them back produces an
 * instant mutual match, with no second device needed.
 */
const ADMIRERS = [
  { email: 'date-mia@test.com', firstName: 'Mia', lastName: 'Reed', age: 24 },
  { email: 'date-zoe@test.com', firstName: 'Zoe', lastName: 'Lane', age: 26 },
] as const;

/**
 * Arm a one-tap like -> match -> chat scenario for the reserved `me@test.com`
 * account. Idempotent: clears any previous match state first, so you can re-run
 * this to reset after each test.
 */
export async function seedArmedMatch(redis: Redis): Promise<void> {
  const me = await prisma.user.findUnique({ where: { email: ME_EMAIL } });
  if (!me) {
    step(`${ME_EMAIL} not found — skipped armed match`);
    return;
  }

  // Reset: drop previous chats/likes so the match is fresh on every re-run.
  await prisma.chatSession.deleteMany({
    where: { OR: [{ user1Id: me.id }, { user2Id: me.id }] },
  });
  await prisma.interaction.deleteMany({
    where: { OR: [{ actorUserId: me.id }, { targetUserId: me.id }] },
  });
  await redis.del(`chat:user:${me.id}`);

  await checkInUser(redis, me.id, DEMO_VENUE_ID);

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  for (const [i, admirer] of ADMIRERS.entries()) {
    const user = await prisma.user.upsert({
      where: { email: admirer.email },
      update: { profileImageUrl: avatarUrl(Gender.FEMALE, 90 + i) },
      create: {
        email: admirer.email,
        passwordHash,
        firstName: admirer.firstName,
        lastName: admirer.lastName,
        gender: Gender.FEMALE,
        birthDate: new Date(new Date().getFullYear() - admirer.age, 3, 12),
        profileImageUrl: avatarUrl(Gender.FEMALE, 90 + i),
        bio: `Hi, I'm ${admirer.firstName} — coffee and good conversation.`,
        role: Role.USER,
        preference: {
          create: {
            minAge: 18,
            maxAge: 45,
            preferredGender: Gender.MALE,
            lookingFor: [LookingFor.COFFEE_CHAT, LookingFor.FRIENDSHIP],
          },
        },
      },
    });

    await checkInUser(redis, user.id, DEMO_VENUE_ID);
    await redis.del(`chat:user:${user.id}`);

    // Their like toward me -> my like back completes the match.
    await prisma.interaction.create({
      data: {
        venueId: DEMO_VENUE_ID,
        actorUserId: user.id,
        targetUserId: me.id,
        type: InteractionType.LIKE,
        createdAt: new Date(Date.now() - DAY_MS),
      },
    });
  }

  step(
    `${ME_EMAIL} checked in with ${ADMIRERS.length} admirers ` +
      `(${ADMIRERS.map(a => a.firstName).join(' & ')}) ready to match`,
  );
}
