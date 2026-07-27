import { Gender, Role, VisitSource } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { DAY_MS, PASSWORD, prisma, step, VENUES } from './config';

/**
 * Venue owners for the analytics dashboard.
 *
 * Two of them on purpose: the second owns a different venue, so you can verify
 * that a manager gets 403 on a venue they don't own.
 */
export const MANAGERS = [
  { email: 'manager@test.com', venueIndex: 0 },
  { email: 'manager2@test.com', venueIndex: 1 },
] as const;

/**
 * Busy mornings and evenings, dead early afternoon — gives the traffic-by-hour
 * chart real quiet hours to flag.
 */
const HOUR_WEIGHTS: Record<number, number> = {
  8: 6,
  9: 8,
  10: 7,
  11: 6,
  12: 4,
  13: 3,
  14: 1,
  15: 1,
  16: 2,
  17: 6,
  18: 8,
  19: 7,
  20: 4,
  21: 2,
};

const VISITS_PER_USER_MIN = 20;
const VISITS_PER_USER_SPREAD = 50;
const CAMPAIGN_EXTRA_VISITS = 400;
const VIEWS_PER_VISIT = 1.8; // keeps conversion rate realistically under 100%

function pickHour(): number {
  const entries = Object.entries(HOUR_WEIGHTS);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [hour, weight] of entries) {
    r -= weight;
    if (r <= 0) {
      return Number(hour);
    }
  }
  return 9;
}

function timestampDaysAgo(daysAgo: number): Date {
  const d = new Date(Date.now() - daysAgo * DAY_MS);
  d.setHours(pickHour(), Math.floor(Math.random() * 60), 0, 0);
  return d;
}

/** Give each demo venue an owner and promote them to CAFE_MANAGER. */
export async function seedVenueOwners(): Promise<void> {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  for (const manager of MANAGERS) {
    const user = await prisma.user.upsert({
      where: { email: manager.email },
      update: { role: Role.CAFE_MANAGER },
      create: {
        email: manager.email,
        passwordHash,
        role: Role.CAFE_MANAGER,
        firstName: 'Cafe',
        lastName: 'Manager',
        gender: Gender.OTHER,
        bio: 'Venue manager (analytics demo account)',
        birthDate: new Date('1988-01-01'),
      },
    });

    await prisma.venue.update({
      where: { id: VENUES[manager.venueIndex].id },
      data: { ownerId: user.id },
    });
  }

  step(
    `${MANAGERS.length} venue owners (${MANAGERS.map(m => m.email).join(', ')})`,
  );
}

/**
 * Backfill 30 days of visits, views, and one finished campaign for the demo
 * venue, so every dashboard chart has real shape (quiet hours, age buckets,
 * a positive campaign lift) instead of being empty.
 */
export async function seedAnalytics(): Promise<void> {
  const venueId = VENUES[0].id;

  // Idempotent: wipe this venue's demo analytics before regenerating.
  await prisma.visit.deleteMany({ where: { venueId } });
  await prisma.venueView.deleteMany({ where: { venueId } });
  await prisma.campaign.deleteMany({ where: { venueId } });

  const users = await prisma.user.findMany({
    where: { role: Role.USER },
    select: { id: true },
  });

  if (users.length === 0) {
    step('no users found — skipped analytics backfill');
    return;
  }

  const now = Date.now();
  const campaign = await prisma.campaign.create({
    data: {
      venueId,
      name: 'Afternoon Boost — 20% off 2-4pm',
      startDate: new Date(now - 12 * DAY_MS),
      endDate: new Date(now - 5 * DAY_MS),
      offer: '20% off all drinks 2-4pm',
    },
  });

  const inCampaignWindow = (daysAgo: number) => daysAgo >= 5 && daysAgo <= 12;

  const visits = users.flatMap(user => {
    const count =
      VISITS_PER_USER_MIN + Math.floor(Math.random() * VISITS_PER_USER_SPREAD);

    return Array.from({ length: count }, () => {
      const daysAgo = Math.floor(Math.random() * 30);
      return {
        venueId,
        userId: user.id,
        visitedAt: timestampDaysAgo(daysAgo),
        source: VisitSource.CHECK_IN,
        campaignId: inCampaignWindow(daysAgo) ? campaign.id : null,
      };
    });
  });

  // Extra weight inside the campaign window so the before/after shows a lift.
  for (let i = 0; i < CAMPAIGN_EXTRA_VISITS; i++) {
    const user = users[Math.floor(Math.random() * users.length)];
    visits.push({
      venueId,
      userId: user.id,
      visitedAt: timestampDaysAgo(5 + Math.floor(Math.random() * 8)),
      source: VisitSource.CHECK_IN,
      campaignId: campaign.id,
    });
  }

  const views = Array.from(
    { length: Math.round(visits.length * VIEWS_PER_VISIT) },
    () => ({
      venueId,
      userId: users[Math.floor(Math.random() * users.length)].id,
      viewedAt: timestampDaysAgo(Math.floor(Math.random() * 30)),
    }),
  );

  await prisma.visit.createMany({ data: visits });
  await prisma.venueView.createMany({ data: views });

  step(
    `${visits.length} visits + ${views.length} views + 1 campaign for ${VENUES[0].name}`,
  );
}
