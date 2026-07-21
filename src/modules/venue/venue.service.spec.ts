import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { VenueStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { VENUE_MESSAGES } from '@/modules/venue/constants/messages';
import * as MapUtils from '@/modules/venue/utils/map-url.util';
import * as QrUtils from '@/modules/venue/utils/qr-code.util';
import { VenueService } from '@/modules/venue/venue.service';

// Mock the utils modules
vi.mock('@/modules/venue/utils/map-url.util', async importOriginal => {
  const actual = await importOriginal<typeof MapUtils>();
  return {
    ...actual,
    extractLatLonFromGoogleMaps: vi.fn(),
    isWithinDistance: vi.fn(),
    haversineDistance: vi.fn(),
  };
});

vi.mock('@/modules/venue/utils/qr-code.util', async importOriginal => {
  const actual = await importOriginal<typeof QrUtils>();
  return {
    ...actual,
    generateQRCodeDataURL: vi
      .fn()
      .mockResolvedValue('data:image/png;base64,qr'),
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

  describe('getNearbyVenues', () => {
    it('should only query active venues with coordinates set', async () => {
      vi.spyOn(prismaService.venue, 'findMany').mockResolvedValue([]);

      await venueService.getNearbyVenues({
        latitude: 41.0082,
        longitude: 28.9784,
      });

      expect(prismaService.venue.findMany).toHaveBeenCalledWith({
        where: {
          status: VenueStatus.ACTIVE,
          latitude: { not: null },
          longitude: { not: null },
        },
      });
    });

    it('should exclude venues outside the given radius', async () => {
      const nearVenue = {
        id: 'v1',
        name: 'Near',
        latitude: 41.01,
        longitude: 28.98,
      };
      const farVenue = {
        id: 'v2',
        name: 'Far',
        latitude: 42.5,
        longitude: 30.5,
      };
      vi.spyOn(prismaService.venue, 'findMany').mockResolvedValue([
        nearVenue,
        farVenue,
      ] as any);
      vi.mocked(MapUtils.haversineDistance).mockImplementation(
        (_user, venue) =>
          venue.venueLat === nearVenue.latitude ? 500 : 100000,
      );

      const result = await venueService.getNearbyVenues({
        latitude: 41.0082,
        longitude: 28.9784,
        radiusMeters: 5000,
      });

      expect(result).toEqual([nearVenue]);
    });

    it('should default the radius to 5km when not provided', async () => {
      const venue = {
        id: 'v1',
        name: 'Venue',
        latitude: 41.01,
        longitude: 28.98,
      };
      vi.spyOn(prismaService.venue, 'findMany').mockResolvedValue([
        venue,
      ] as any);
      vi.mocked(MapUtils.haversineDistance).mockReturnValue(4999);

      const result = await venueService.getNearbyVenues({
        latitude: 41.0082,
        longitude: 28.9784,
      });

      expect(result).toEqual([venue]);
    });

    it('should sort results nearest-first', async () => {
      const closer = {
        id: 'v1',
        name: 'Closer',
        latitude: 41.01,
        longitude: 28.98,
      };
      const farther = {
        id: 'v2',
        name: 'Farther',
        latitude: 41.02,
        longitude: 28.99,
      };
      vi.spyOn(prismaService.venue, 'findMany').mockResolvedValue([
        farther,
        closer,
      ] as any);
      vi.mocked(MapUtils.haversineDistance).mockImplementation(
        (_user, venue) => (venue.venueLat === closer.latitude ? 300 : 1200),
      );

      const result = await venueService.getNearbyVenues({
        latitude: 41.0082,
        longitude: 28.9784,
      });

      expect(result).toEqual([closer, farther]);
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

  // -----------------------------------------------------------------------
  // checkOut
  // -----------------------------------------------------------------------
  describe('checkOut', () => {
    const userId = 'user-1';
    const venueId = 'venue-1';

    it('should throw BadRequestException if user is not checked in to the venue', async () => {
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValue(
        'venue-other',
      );

      await expect(venueService.checkOut(userId, venueId)).rejects.toThrow(
        new BadRequestException(VENUE_MESSAGES.NOT_CHECKED_IN),
      );
    });

    it('should throw BadRequestException if user has no active venue', async () => {
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValue(null);

      await expect(venueService.checkOut(userId, venueId)).rejects.toThrow(
        new BadRequestException(VENUE_MESSAGES.NOT_CHECKED_IN),
      );
    });

    it('should remove user from venue on successful checkout', async () => {
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValue(venueId);
      vi.spyOn(redisService, 'removeUserFromVenue').mockResolvedValue(
        undefined,
      );

      await venueService.checkOut(userId, venueId);

      expect(redisService.removeUserFromVenue).toHaveBeenCalledWith(
        userId,
        venueId,
      );
    });
  });

  // -----------------------------------------------------------------------
  // getVenue (exercises getVenueById internally)
  // -----------------------------------------------------------------------
  describe('getVenue', () => {
    const venueId = 'venue-42';
    const mockVenueRow = {
      id: venueId,
      name: 'Brew Lab',
      status: VenueStatus.ACTIVE,
      latitude: 51.5,
      longitude: -0.1,
      geofenceMeters: 50,
      mapUrl: 'https://maps.google.com/?q=51.5,-0.1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should throw NotFoundException when venue does not exist', async () => {
      vi.spyOn(prismaService.venue, 'findUnique').mockResolvedValue(null);

      await expect(venueService.getVenue(venueId)).rejects.toThrow(
        new NotFoundException(VENUE_MESSAGES.VENUE_NOT_FOUND),
      );
    });

    it('should return venue with qrCode when found', async () => {
      vi.spyOn(prismaService.venue, 'findUnique').mockResolvedValue(
        mockVenueRow as any,
      );

      const result = await venueService.getVenue(venueId);

      expect(result.id).toBe(venueId);
      expect(result.qrCode).toBe('data:image/png;base64,qr');
    });
  });

  // -----------------------------------------------------------------------
  // updateVenue
  // -----------------------------------------------------------------------
  describe('updateVenue', () => {
    const venueId = 'venue-55';
    const baseVenue = {
      id: venueId,
      name: 'Old Name',
      status: VenueStatus.ACTIVE,
      latitude: 10.0,
      longitude: 20.0,
      geofenceMeters: 100,
      mapUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should throw NotFoundException when the venue to update does not exist', async () => {
      vi.spyOn(prismaService.venue, 'findUnique').mockResolvedValue(null);

      await expect(
        venueService.updateVenue(venueId, { name: 'New Name' }),
      ).rejects.toThrow(new NotFoundException(VENUE_MESSAGES.VENUE_NOT_FOUND));
    });

    it('should update the venue name without touching coordinates when no mapUrl given', async () => {
      vi.spyOn(prismaService.venue, 'findUnique').mockResolvedValue(
        baseVenue as any,
      );
      const updatedVenue = { ...baseVenue, name: 'New Name' };
      vi.spyOn(prismaService.venue, 'update').mockResolvedValue(
        updatedVenue as any,
      );

      const result = await venueService.updateVenue(venueId, {
        name: 'New Name',
      });

      expect(prismaService.venue.update).toHaveBeenCalledWith({
        where: { id: venueId },
        data: expect.objectContaining({ name: 'New Name' }),
      });
      expect(result.name).toBe('New Name');
      expect(MapUtils.extractLatLonFromGoogleMaps).not.toHaveBeenCalled();
    });

    it('should extract and save new coordinates when mapUrl is supplied', async () => {
      vi.spyOn(prismaService.venue, 'findUnique').mockResolvedValue(
        baseVenue as any,
      );
      vi.mocked(MapUtils.extractLatLonFromGoogleMaps).mockResolvedValue({
        latitude: 55.0,
        longitude: 37.0,
      });
      const updatedVenue = {
        ...baseVenue,
        mapUrl: 'https://maps.google.com/?q=55.0,37.0',
        latitude: 55.0,
        longitude: 37.0,
      };
      vi.spyOn(prismaService.venue, 'update').mockResolvedValue(
        updatedVenue as any,
      );

      const result = await venueService.updateVenue(venueId, {
        mapUrl: 'https://maps.google.com/?q=55.0,37.0',
      });

      expect(MapUtils.extractLatLonFromGoogleMaps).toHaveBeenCalled();
      expect(prismaService.venue.update).toHaveBeenCalledWith({
        where: { id: venueId },
        data: expect.objectContaining({ latitude: 55.0, longitude: 37.0 }),
      });
      expect(result.latitude).toBe(55.0);
    });

    it('should throw BadRequestException when mapUrl cannot be parsed', async () => {
      vi.spyOn(prismaService.venue, 'findUnique').mockResolvedValue(
        baseVenue as any,
      );
      vi.mocked(MapUtils.extractLatLonFromGoogleMaps).mockResolvedValue(null);

      await expect(
        venueService.updateVenue(venueId, {
          mapUrl: 'https://example.com/bad-url',
        }),
      ).rejects.toThrow(
        new BadRequestException(VENUE_MESSAGES.INVALID_MAP_URL),
      );
    });
  });

  // -----------------------------------------------------------------------
  // deleteVenue
  // -----------------------------------------------------------------------
  describe('deleteVenue', () => {
    const venueId = 'venue-77';
    const baseVenue = {
      id: venueId,
      name: 'Old Venue',
      status: VenueStatus.ACTIVE,
      latitude: 0,
      longitude: 0,
      geofenceMeters: 50,
      mapUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should throw NotFoundException when venue does not exist', async () => {
      vi.spyOn(prismaService.venue, 'findUnique').mockResolvedValue(null);

      await expect(venueService.deleteVenue(venueId)).rejects.toThrow(
        new NotFoundException(VENUE_MESSAGES.VENUE_NOT_FOUND),
      );
    });

    it('should soft-delete by setting status to PERMANENTLY_CLOSED', async () => {
      vi.spyOn(prismaService.venue, 'findUnique').mockResolvedValue(
        baseVenue as any,
      );
      const deletedVenue = {
        ...baseVenue,
        status: VenueStatus.PERMANENTLY_CLOSED,
      };
      vi.spyOn(prismaService.venue, 'update').mockResolvedValue(
        deletedVenue as any,
      );

      const result = await venueService.deleteVenue(venueId);

      expect(prismaService.venue.update).toHaveBeenCalledWith({
        where: { id: venueId },
        data: { status: VenueStatus.PERMANENTLY_CLOSED },
      });
      expect(result.status).toBe(VenueStatus.PERMANENTLY_CLOSED);
    });
  });

  // -----------------------------------------------------------------------
  // checkIn — additional paths
  // -----------------------------------------------------------------------
  describe('checkIn — permanently closed venue', () => {
    const userId = 'user-2';
    const venueId = 'venue-pc';
    const checkInDto = { latitude: 0, longitude: 0 };

    it('should throw BadRequestException if venue is permanently closed', async () => {
      vi.spyOn(prismaService.venue, 'findUnique').mockResolvedValue({
        id: venueId,
        name: 'Gone Shop',
        status: VenueStatus.PERMANENTLY_CLOSED,
        latitude: 0,
        longitude: 0,
        geofenceMeters: 50,
      } as any);

      await expect(
        venueService.checkIn(userId, venueId, checkInDto),
      ).rejects.toThrow(
        new BadRequestException(VENUE_MESSAGES.VENUE_PERMANENTLY_CLOSED),
      );
    });
  });
});
