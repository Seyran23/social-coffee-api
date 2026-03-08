import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { VenueStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { VENUE_MESSAGES } from '@/modules/venue/constants/messages';
import * as MapUtils from '@/modules/venue/utils/map-url.util';
import { VenueService } from '@/modules/venue/venue.service';

// Mock the utils module
vi.mock('@/modules/venue/utils/map-url.util', async importOriginal => {
  const actual = await importOriginal<typeof MapUtils>();
  return {
    ...actual,
    isWithinDistance: vi.fn(),
    haversineDistance: vi.fn(),
  };
});

describe('VenueService', () => {
  let venueService: VenueService;
  let prismaService: PrismaService;
  let redisService: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VenueService,
        {
          provide: PrismaService,
          useValue: {
            venue: {
              findUnique: vi.fn(),
              findMany: vi.fn(),
              count: vi.fn(),
              create: vi.fn(),
              update: vi.fn(),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            getUserCurrentVenue: vi.fn(),
            removeUserFromVenue: vi.fn(),
            addUserToVenue: vi.fn(),
            updateHeartbeat: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            log: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
          },
        },
      ],
    }).compile();

    venueService = module.get<VenueService>(VenueService);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);

    vi.clearAllMocks();
  });

  describe('checkIn', () => {
    const userId = 'user-1';
    const venueId = 'venue-1';
    const checkInDto = { latitude: 40.7128, longitude: -74.006 };

    const mockVenue = {
      id: venueId,
      name: 'Coffee Shop',
      status: VenueStatus.ACTIVE,
      latitude: 40.7128,
      longitude: -74.006,
      geofenceMeters: 100,
    };

    it('should throw NotFoundException if venue does not exist', async () => {
      vi.spyOn(prismaService.venue, 'findUnique').mockResolvedValue(null);

      await expect(
        venueService.checkIn(userId, venueId, checkInDto),
      ).rejects.toThrow(new NotFoundException(VENUE_MESSAGES.VENUE_NOT_FOUND));
    });

    it('should throw BadRequestException if venue is temporarily closed', async () => {
      vi.spyOn(prismaService.venue, 'findUnique').mockResolvedValue({
        ...mockVenue,
        status: VenueStatus.TEMPORARILY_CLOSED,
      } as any);

      await expect(
        venueService.checkIn(userId, venueId, checkInDto),
      ).rejects.toThrow(
        new BadRequestException(VENUE_MESSAGES.VENUE_TEMPORARILY_CLOSED),
      );
    });

    it('should throw BadRequestException if user is outside geofence', async () => {
      vi.spyOn(prismaService.venue, 'findUnique').mockResolvedValue(
        mockVenue as any,
      );
      vi.mocked(MapUtils.isWithinDistance).mockReturnValue(false);
      vi.mocked(MapUtils.haversineDistance).mockReturnValue(200);

      await expect(
        venueService.checkIn(userId, venueId, checkInDto),
      ).rejects.toThrow(
        new BadRequestException(VENUE_MESSAGES.OUTSIDE_GEOFENCE),
      );
    });

    it('should throw BadRequestException if user is already checked in to the same venue', async () => {
      vi.spyOn(prismaService.venue, 'findUnique').mockResolvedValue(
        mockVenue as any,
      );
      vi.mocked(MapUtils.isWithinDistance).mockReturnValue(true);

      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValue(venueId);

      await expect(
        venueService.checkIn(userId, venueId, checkInDto),
      ).rejects.toThrow(
        new BadRequestException(VENUE_MESSAGES.ALREADY_CHECKED_IN),
      );
    });

    it('should auto-checkout from previous venue if checking into a new one', async () => {
      vi.spyOn(prismaService.venue, 'findUnique').mockResolvedValue(
        mockVenue as any,
      );
      vi.mocked(MapUtils.isWithinDistance).mockReturnValue(true);

      const oldVenueId = 'venue-old';
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValue(
        oldVenueId,
      );

      await venueService.checkIn(userId, venueId, checkInDto);

      expect(redisService.removeUserFromVenue).toHaveBeenCalledWith(
        userId,
        oldVenueId,
      );
      expect(redisService.addUserToVenue).toHaveBeenCalledWith(userId, venueId);
      expect(redisService.updateHeartbeat).toHaveBeenCalledWith(userId);
    });

    it('should successfully check in user to a venue', async () => {
      vi.spyOn(prismaService.venue, 'findUnique').mockResolvedValue(
        mockVenue as any,
      );
      vi.mocked(MapUtils.isWithinDistance).mockReturnValue(true);

      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValue(null);

      const result = await venueService.checkIn(userId, venueId, checkInDto);

      expect(result.id).toEqual(venueId);
      expect(redisService.addUserToVenue).toHaveBeenCalledWith(userId, venueId);
      expect(redisService.updateHeartbeat).toHaveBeenCalledWith(userId);
    });
  });

  describe('getVenues', () => {
    it('should paginate and return venues', async () => {
      const mockVenuesList = [{ id: 'v1', name: 'Venue 1' }];
      vi.spyOn(prismaService.venue, 'findMany').mockResolvedValue(
        mockVenuesList as any,
      );
      vi.spyOn(prismaService.venue, 'count').mockResolvedValue(1);

      const result = await venueService.getVenues({
        page: 2,
        limit: 10,
        search: 'Venue',
      });

      expect(prismaService.venue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10, // (page 2 - 1) * 10
          take: 10,
          where: {
            name: { contains: 'Venue', mode: 'insensitive' },
          },
        }),
      );
      expect(result.venues).toEqual(mockVenuesList);
      expect(result.total).toBe(1);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
    });
  });

  describe('changeVenueStatus', () => {
    it('should toggle status if no status is provided', async () => {
      vi.spyOn(prismaService.venue, 'findUnique').mockResolvedValue({
        id: 'v1',
        status: VenueStatus.ACTIVE,
      } as any);

      vi.spyOn(prismaService.venue, 'update').mockResolvedValue({
        id: 'v1',
        status: VenueStatus.TEMPORARILY_CLOSED,
      } as any);

      const result = await venueService.changeVenueStatus('v1');

      expect(prismaService.venue.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: { status: VenueStatus.TEMPORARILY_CLOSED },
      });
      expect(result.status).toBe(VenueStatus.TEMPORARILY_CLOSED);
    });
  });
});
