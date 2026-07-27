import { ChatSessionStatus } from '@prisma/client';

import { prisma, step, VENUES } from './config';

const SAMPLE_MESSAGES = [
  'Hey! Just ordered a flat white, want to grab a table?',
  'Sure! I am by the window, come say hi.',
  'This place has the best oat milk lattes.',
  'Totally agree, I come here every week.',
];

/**
 * A few realistic matches so the Chats tab isn't empty: 3 still inside their
 * 10-minute window, 2 already expired.
 *
 * These are seeded ACTIVE/EXPIRED with timings already set, which mirrors a
 * chat whose countdown was started by a first message.
 */
const CHAT_PLANS = [
  { venueIndex: 0, status: ChatSessionStatus.ACTIVE, startedMinAgo: 3 },
  { venueIndex: 1, status: ChatSessionStatus.EXPIRED, startedMinAgo: 45 },
  { venueIndex: 2, status: ChatSessionStatus.ACTIVE, startedMinAgo: 1 },
  { venueIndex: 3, status: ChatSessionStatus.EXPIRED, startedMinAgo: 60 },
  { venueIndex: 4, status: ChatSessionStatus.ACTIVE, startedMinAgo: 6 },
] as const;

const CHAT_DURATION_MIN = 10;

export async function seedChats(venueGroups: string[][]): Promise<void> {
  // Idempotent: drop any previously seeded chats for the demo venues, so
  // re-running the seed refreshes them instead of piling up duplicates.
  // Messages cascade with the session.
  await prisma.chatSession.deleteMany({
    where: { venueId: { in: VENUES.map(v => v.id) } },
  });

  const now = Date.now();
  let created = 0;

  for (const plan of CHAT_PLANS) {
    const group = venueGroups[plan.venueIndex] ?? [];
    const [user1Id, user2Id] = group;
    if (!user1Id || !user2Id) {
      continue;
    }

    const startedAt = new Date(now - plan.startedMinAgo * 60_000);
    const expiresAt = new Date(
      startedAt.getTime() + CHAT_DURATION_MIN * 60_000,
    );

    const session = await prisma.chatSession.create({
      data: {
        venueId: VENUES[plan.venueIndex].id,
        user1Id,
        user2Id,
        status: plan.status,
        startedAt,
        expiresAt,
      },
    });

    await prisma.message.createMany({
      data: SAMPLE_MESSAGES.map((content, i) => ({
        chatSessionId: session.id,
        senderId: i % 2 === 0 ? user1Id : user2Id,
        content,
        createdAt: new Date(startedAt.getTime() + i * 30_000),
      })),
    });

    created++;
  }

  const active = CHAT_PLANS.filter(
    p => p.status === ChatSessionStatus.ACTIVE,
  ).length;
  step(
    `${created} chat sessions with messages (${active} active, ${created - active} expired)`,
  );
}
