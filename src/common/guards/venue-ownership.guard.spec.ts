import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VenueOwnershipGuard } from '@/common/guards/venue-ownership.guard';
import { PrismaService } from '@/database/prisma.service';

describe('VenueOwnershipGuard', () => {
  let guard: VenueOwnershipGuard;
  let prisma: { venue: { findUnique: ReturnType<typeof vi.fn> } };

  const contextFor = (user: unknown, params: Record<string, string>) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    prisma = { venue: { findUnique: vi.fn() } };
    guard = new VenueOwnershipGuard(prisma as unknown as PrismaService);
  });

  it('throws Forbidden when there is no authenticated user', async () => {
    await expect(
      guard.canActivate(contextFor(undefined, { venueId: 'v1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows ADMIN without touching the database', async () => {
    const ctx = contextFor(
      { userId: 'admin-1', role: Role.ADMIN },
      { venueId: 'v1' },
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.venue.findUnique).not.toHaveBeenCalled();
  });

  it('allows a CAFE_MANAGER who owns the venue', async () => {
    prisma.venue.findUnique.mockResolvedValue({ ownerId: 'mgr-1' });
    const ctx = contextFor(
      { userId: 'mgr-1', role: Role.CAFE_MANAGER },
      { venueId: 'v1' },
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('forbids a CAFE_MANAGER who does not own the venue', async () => {
    prisma.venue.findUnique.mockResolvedValue({ ownerId: 'someone-else' });
    const ctx = contextFor(
      { userId: 'mgr-1', role: Role.CAFE_MANAGER },
      { venueId: 'v1' },
    );
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('404s when the venue does not exist', async () => {
    prisma.venue.findUnique.mockResolvedValue(null);
    const ctx = contextFor(
      { userId: 'mgr-1', role: Role.CAFE_MANAGER },
      { venueId: 'missing' },
    );
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s when no venue id is present in the route params', async () => {
    const ctx = contextFor({ userId: 'mgr-1', role: Role.CAFE_MANAGER }, {});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('reads the venue id from :id when :venueId is absent', async () => {
    prisma.venue.findUnique.mockResolvedValue({ ownerId: 'mgr-1' });
    const ctx = contextFor(
      { userId: 'mgr-1', role: Role.CAFE_MANAGER },
      { id: 'v9' },
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.venue.findUnique).toHaveBeenCalledWith({
      where: { id: 'v9' },
      select: { ownerId: true },
    });
  });
});
