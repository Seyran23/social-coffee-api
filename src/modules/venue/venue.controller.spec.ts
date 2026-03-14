import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponseBuilder } from '@/common/utils/response-builder';
import { VENUE_MESSAGES } from '@/modules/venue/constants/messages';
import { VenueController } from '@/modules/venue/venue.controller';
import { VenueService } from '@/modules/venue/venue.service';

describe('VenueController', () => {
  let venueController: VenueController;
  let venueService: VenueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VenueController],
      providers: [
        {
          provide: VenueService,
          useValue: {
            getVenues: vi.fn(),
            getVenue: vi.fn(),
            getVenueQRCode: vi.fn(),
            createVenue: vi.fn(),
            updateVenue: vi.fn(),
            changeVenueStatus: vi.fn(),
            deleteVenue: vi.fn(),
            checkIn: vi.fn(),
            checkOut: vi.fn(),
          },
        },
      ],
    }).compile();

    venueController = module.get<VenueController>(VenueController);
    venueService = module.get<VenueService>(VenueService);

    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getVenues', () => {
    it('should return paginated venues', async () => {
      const mockResult = {
        venues: [{ id: 'venue-1', name: 'Cafe' }],
        total: 1,
        page: 1,
        limit: 10,
      };
      vi.spyOn(venueService, 'getVenues').mockResolvedValue(mockResult as any);

      const query: any = { page: 1, limit: 10 };
      const result = await venueController.getVenues(query);

      expect(venueService.getVenues).toHaveBeenCalledWith(query);
      expect(result).toEqual(
        ResponseBuilder.paginated(
          mockResult.venues,
          mockResult.total,
          mockResult.page,
          mockResult.limit,
          VENUE_MESSAGES.VENUES_RETRIEVED,
        ),
      );
    });
  });

  describe('getVenue', () => {
    it('should return a single venue by id', async () => {
      const mockVenue = { id: 'venue-1', name: 'Cafe' };
      vi.spyOn(venueService, 'getVenue').mockResolvedValue(mockVenue as any);

      const result = await venueController.getVenue('venue-1');

      expect(venueService.getVenue).toHaveBeenCalledWith('venue-1');
      expect(result).toEqual(
        ResponseBuilder.success(mockVenue, VENUE_MESSAGES.VENUE_RETRIEVED),
      );
    });
  });

  describe('getVenueQRCode', () => {
    it('should return qr code payload', async () => {
      vi.spyOn(venueService, 'getVenueQRCode').mockResolvedValue(
        'data:image/png;base64,abc==' as any,
      );

      const result = await venueController.getVenueQRCode('venue-1');

      expect(venueService.getVenueQRCode).toHaveBeenCalledWith('venue-1');
      expect(result).toEqual(
        ResponseBuilder.success(
          { venueId: 'venue-1', qrCode: 'data:image/png;base64,abc==' },
          VENUE_MESSAGES.QRCODE_GENERATED,
        ),
      );
    });
  });

  describe('createVenue', () => {
    it('should create and return a new venue', async () => {
      const dto: any = { name: 'New Cafe', latitude: 40.0, longitude: 29.0 };
      const mockVenue = { id: 'venue-new', ...dto };
      vi.spyOn(venueService, 'createVenue').mockResolvedValue(mockVenue as any);

      const result = await venueController.createVenue(dto);

      expect(venueService.createVenue).toHaveBeenCalledWith(dto);
      expect(result).toEqual(
        ResponseBuilder.success(mockVenue, VENUE_MESSAGES.VENUE_CREATED, 201),
      );
    });
  });

  describe('updateVenue', () => {
    it('should update and return the venue', async () => {
      const dto: any = { name: 'Updated Cafe' };
      const mockVenue = { id: 'venue-1', name: 'Updated Cafe' };
      vi.spyOn(venueService, 'updateVenue').mockResolvedValue(mockVenue as any);

      const result = await venueController.updateVenue('venue-1', dto);

      expect(venueService.updateVenue).toHaveBeenCalledWith('venue-1', dto);
      expect(result).toEqual(
        ResponseBuilder.success(mockVenue, VENUE_MESSAGES.VENUE_UPDATED),
      );
    });
  });

  describe('changeVenueStatus', () => {
    it('should change status and return the venue', async () => {
      const dto: any = { status: 'TEMPORARILY_CLOSED' };
      const mockVenue = { id: 'venue-1', status: 'TEMPORARILY_CLOSED' };
      vi.spyOn(venueService, 'changeVenueStatus').mockResolvedValue(
        mockVenue as any,
      );

      const result = await venueController.changeVenueStatus('venue-1', dto);

      expect(venueService.changeVenueStatus).toHaveBeenCalledWith(
        'venue-1',
        dto.status,
      );
      expect(result).toEqual(
        ResponseBuilder.success(mockVenue, VENUE_MESSAGES.VENUE_STATUS_UPDATED),
      );
    });
  });

  describe('deleteVenue', () => {
    it('should soft-delete and return the venue', async () => {
      const mockVenue = { id: 'venue-1', status: 'PERMANENTLY_CLOSED' };
      vi.spyOn(venueService, 'deleteVenue').mockResolvedValue(mockVenue as any);

      const result = await venueController.deleteVenue('venue-1');

      expect(venueService.deleteVenue).toHaveBeenCalledWith('venue-1');
      expect(result).toEqual(
        ResponseBuilder.success(mockVenue, VENUE_MESSAGES.VENUE_DELETED),
      );
    });
  });

  describe('checkinToVenue', () => {
    it('should check in user and return the result', async () => {
      const dto: any = { latitude: 40.0, longitude: 29.0 };
      const mockResult = { venueId: 'venue-1', userId: 'user-1' };
      vi.spyOn(venueService, 'checkIn').mockResolvedValue(mockResult as any);

      const result = await venueController.checkinToVenue(
        'venue-1',
        dto,
        'user-1',
      );

      expect(venueService.checkIn).toHaveBeenCalledWith(
        'user-1',
        'venue-1',
        dto,
      );
      expect(result).toEqual(
        ResponseBuilder.success(mockResult, VENUE_MESSAGES.CHECK_IN_SUCCESS),
      );
    });
  });

  describe('checkoutFromVenue', () => {
    it('should check out user and return success', async () => {
      const result = await venueController.checkoutFromVenue(
        'venue-1',
        'user-1',
      );

      expect(venueService.checkOut).toHaveBeenCalledWith('user-1', 'venue-1');
      expect(result).toEqual(
        ResponseBuilder.success(null, VENUE_MESSAGES.CHECK_OUT_SUCCESS),
      );
    });
  });
});
