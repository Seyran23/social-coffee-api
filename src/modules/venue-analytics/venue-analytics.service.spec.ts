import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';

import { VenueAnalyticsService } from './venue-analytics.service';

describe('VenueAnalyticsService', () => {
  let service: VenueAnalyticsService;
  let prisma: any;
  let redis: any;

  beforeEach(async () => {
    prisma = {
      visit: { groupBy: vi.fn() },
      venueView: { count: vi.fn() },
      campaign: { findFirst: vi.fn() },
      $queryRaw: vi.fn(),
    };
    redis = {
      // Force a cache miss so the compute path always runs.
      getJson: vi.fn().mockResolvedValue(null),
      cacheJson: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VenueAnalyticsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        {
          provide: LoggerService,
          useValue: {
            log: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            setContext: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<VenueAnalyticsService>(VenueAnalyticsService);
  });

  describe('getOverview', () => {
    beforeEach(() => {
      // groupBy WITH _count → the period visit groups; WITHOUT → the prior-window
      // (returning-visitor) probe.
      prisma.visit.groupBy.mockImplementation((args: any) =>
        args._count
          ? Promise.resolve([
              { userId: 'u1', _count: { _all: 3 } },
              { userId: 'u2', _count: { _all: 1 } },
              { userId: 'u3', _count: { _all: 2 } },
            ])
          : Promise.resolve([{ userId: 'u1' }]),
      );
      prisma.venueView.count.mockResolvedValue(12);
    });

    it('derives customers, conversion and repeat correctly', async () => {
      const result = await service.getOverview('v1', {});

      expect(result.customers.totalVisits).toBe(6);
      expect(result.customers.newVisitors).toBe(2); // 3 distinct − 1 returning
      expect(result.customers.returningVisitors).toBe(1);

      expect(result.conversion.views).toBe(12);
      expect(result.conversion.visits).toBe(6);
      expect(result.conversion.conversionRate).toBe(0.5); // 6 / 12

      expect(result.repeat.distinctVisitors).toBe(3);
      expect(result.repeat.usersWith2PlusVisits).toBe(2); // u1, u3
      expect(result.repeat.repeatRate).toBe(0.6667); // 2 / 3
    });

    it('caches the computed result', async () => {
      await service.getOverview('v1', {});
      expect(redis.cacheJson).toHaveBeenCalled();
    });
  });

  describe('getAgeDistribution (k-anonymity floor)', () => {
    it('suppresses buckets under the floor into undisclosed', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { bucket: '18-24', count: 10 },
        { bucket: '25-30', count: 3 }, // below 5 → folded
        { bucket: '31-40', count: 7 },
        { bucket: '41+', count: 2 }, // below 5 → folded
        { bucket: 'undisclosed', count: 1 },
      ]);

      const result = await service.getAgeDistribution('v1', {});

      expect(result.buckets).toEqual([
        { bucket: '18-24', count: 10 },
        { bucket: '31-40', count: 7 },
      ]);
      expect(result.undisclosed).toBe(6); // 1 + 3 + 2
    });
  });

  describe('getTrafficByHour', () => {
    it('flags hours below half the daily average as quiet', async () => {
      // Over a 30-day default window.
      prisma.$queryRaw.mockResolvedValue([
        { hour: 9, visits: 300 }, // avg 10/day
        { hour: 14, visits: 20 }, // avg ~0.67/day → quiet
        { hour: 18, visits: 280 }, // avg ~9.33/day
      ]);

      const result = await service.getTrafficByHour('v1', {});

      const quiet = result.hours.filter(h => h.isQuiet).map(h => h.hour);
      expect(quiet).toEqual([14]);
    });
  });

  describe('getCampaignComparison', () => {
    it('404s when the campaign does not belong to the venue', async () => {
      prisma.campaign.findFirst.mockResolvedValue(null);
      await expect(
        service.getCampaignComparison('v1', 'nope'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns per-metric before/after with a lift', async () => {
      prisma.campaign.findFirst.mockResolvedValue({
        id: 'c1',
        name: 'Promo',
        startDate: new Date('2026-07-10T00:00:00.000Z'),
        endDate: new Date('2026-07-17T00:00:00.000Z'),
        offer: '20% off',
      });
      prisma.visit.groupBy.mockImplementation((args: any) =>
        args._count
          ? Promise.resolve([{ userId: 'u1', _count: { _all: 2 } }])
          : Promise.resolve([]),
      );
      prisma.venueView.count.mockResolvedValue(4);

      const result = await service.getCampaignComparison('v1', 'c1');

      expect(result.campaign.id).toBe('c1');
      expect(result.visits).toHaveProperty('before');
      expect(result.visits).toHaveProperty('after');
      expect(result.visits).toHaveProperty('lift');
    });
  });
});
