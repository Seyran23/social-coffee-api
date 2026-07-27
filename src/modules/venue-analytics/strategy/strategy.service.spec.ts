import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';

import { CampaignService } from '../campaign.service';
import { VenueAnalyticsService } from '../venue-analytics.service';

import { GeminiService } from './gemini.service';
import { StrategyService } from './strategy.service';

const future = () => new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
const past = () => new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

describe('StrategyService', () => {
  let service: StrategyService;
  let prisma: any;
  let redis: any;
  let analytics: any;
  let gemini: any;

  beforeEach(async () => {
    prisma = {
      venueStrategy: { findUnique: vi.fn(), upsert: vi.fn() },
    };
    redis = { getTtl: vi.fn().mockResolvedValue(-2), setWithTtl: vi.fn() };
    analytics = {
      getOverview: vi.fn().mockResolvedValue({
        customers: { totalVisits: 100, newVisitors: 40, returningVisitors: 60 },
        conversion: { conversionRate: 0.5 },
        repeat: { repeatRate: 0.6 },
      }),
      getTrafficByHour: vi.fn().mockResolvedValue({
        hours: [
          { hour: 9, avgVisits: 8, isQuiet: false },
          { hour: 14, avgVisits: 1, isQuiet: true },
        ],
      }),
      getAgeDistribution: vi.fn().mockResolvedValue({
        buckets: [
          { bucket: '18-24', count: 5 },
          { bucket: '25-30', count: 12 },
        ],
        undisclosed: 0,
      }),
      getCampaignComparison: vi.fn(),
    };
    gemini = { generate: vi.fn().mockResolvedValue('## Plan\n- do X') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StrategyService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: VenueAnalyticsService, useValue: analytics },
        {
          provide: CampaignService,
          useValue: { list: vi.fn().mockResolvedValue([]) },
        },
        { provide: GeminiService, useValue: gemini },
        {
          provide: LoggerService,
          useValue: { log: vi.fn(), error: vi.fn(), setContext: vi.fn() },
        },
      ],
    }).compile();

    service = module.get(StrategyService);
  });

  it('returns the cached strategy without calling the LLM when still valid', async () => {
    prisma.venueStrategy.findUnique.mockResolvedValue({
      venueId: 'v1',
      content: 'cached',
      generatedAt: new Date(),
      validUntil: future(),
    });

    const res = await service.getStrategy('v1');

    expect(res.content).toBe('cached');
    expect(gemini.generate).not.toHaveBeenCalled();
    expect(res.canRegenerate).toBe(true);
  });

  it('generates a fresh strategy when the stored one is expired', async () => {
    prisma.venueStrategy.findUnique.mockResolvedValue({
      venueId: 'v1',
      content: 'old',
      generatedAt: past(),
      validUntil: past(),
    });
    prisma.venueStrategy.upsert.mockResolvedValue({
      venueId: 'v1',
      content: '## Plan\n- do X',
      generatedAt: new Date(),
      validUntil: future(),
    });

    const res = await service.getStrategy('v1');

    expect(gemini.generate).toHaveBeenCalledOnce();
    expect(res.content).toContain('Plan');
  });

  it('does not call the LLM on regenerate while rate-limited', async () => {
    redis.getTtl.mockResolvedValue(3 * 24 * 60 * 60); // guard active
    prisma.venueStrategy.findUnique.mockResolvedValue({
      venueId: 'v1',
      content: 'current',
      generatedAt: new Date(),
      validUntil: future(),
    });

    const res = await service.regenerate('v1');

    expect(gemini.generate).not.toHaveBeenCalled();
    expect(res.canRegenerate).toBe(false);
    expect(res.regenerateAvailableAt).toBeInstanceOf(Date);
  });

  it('sets the guard and generates when regenerate is allowed', async () => {
    redis.getTtl.mockResolvedValueOnce(-2); // not guarded at check
    prisma.venueStrategy.findUnique.mockResolvedValue(null);
    prisma.venueStrategy.upsert.mockResolvedValue({
      venueId: 'v1',
      content: '## Plan',
      generatedAt: new Date(),
      validUntil: future(),
    });

    await service.regenerate('v1');

    expect(redis.setWithTtl).toHaveBeenCalled();
    expect(gemini.generate).toHaveBeenCalledOnce();
  });

  it('skips the LLM during the post-attempt cooldown and serves the stored copy', async () => {
    redis.getTtl.mockResolvedValue(60); // a generation was attempted recently
    prisma.venueStrategy.findUnique.mockResolvedValue({
      venueId: 'v1',
      content: 'stored',
      generatedAt: past(),
      validUntil: past(), // expired, would normally regenerate
    });

    const res = await service.getStrategy('v1');

    expect(gemini.generate).not.toHaveBeenCalled();
    expect(res.content).toBe('stored');
  });

  it('fails soft to the last stored strategy when generation errors', async () => {
    prisma.venueStrategy.findUnique.mockResolvedValue({
      venueId: 'v1',
      content: 'stale-but-served',
      generatedAt: past(),
      validUntil: past(),
    });
    gemini.generate.mockRejectedValue(new Error('LLM down'));

    const res = await service.getStrategy('v1');

    expect(res.content).toBe('stale-but-served');
  });

  it('throws ServiceUnavailable when generation errors and nothing is stored', async () => {
    prisma.venueStrategy.findUnique.mockResolvedValue(null);
    gemini.generate.mockRejectedValue(new Error('LLM down'));

    await expect(service.getStrategy('v1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
