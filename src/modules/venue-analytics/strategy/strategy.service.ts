import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { VenueStrategy } from '@prisma/client';

import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';

import { CampaignService } from '../campaign.service';
import { VenueAnalyticsService } from '../venue-analytics.service';

import { GeminiError } from './errors/gemini.error';
import { GeminiService } from './gemini.service';
import { StrategyMetrics } from './interfaces/strategy-metrics.interface';
import { StrategyResponse } from './interfaces/strategy-response.interface';
import {
  DAY_MS,
  GEN_COOLDOWN_SECONDS,
  GEN_LOCK_PREFIX,
  REGEN_GUARD_PREFIX,
  REGEN_WINDOW_DAYS,
  STRATEGY_SYSTEM_PROMPT,
  STRATEGY_VALID_DAYS,
} from './strategy.constants';

@Injectable()
export class StrategyService {
  constructor(
    private readonly database: PrismaService,
    private readonly redis: RedisService,
    private readonly analytics: VenueAnalyticsService,
    private readonly campaigns: CampaignService,
    private readonly gemini: GeminiService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(StrategyService.name);
  }

  async getStrategy(venueId: string): Promise<StrategyResponse> {
    const existing = await this.database.venueStrategy.findUnique({
      where: { venueId },
    });

    if (existing && existing.validUntil > new Date()) {
      return this.toResponse(existing);
    }

    return this.generate(venueId, existing);
  }

  async regenerate(venueId: string): Promise<StrategyResponse> {
    const guardKey = `${REGEN_GUARD_PREFIX}:${venueId}`;
    const ttl = await this.redis.getTtl(guardKey);

    if (ttl > 0) {
      const current = await this.database.venueStrategy.findUnique({
        where: { venueId },
      });

      if (current) {
        return this.toResponse(current);
      }
    }

    await this.redis.setWithTtl(
      guardKey,
      new Date().toISOString(),
      REGEN_WINDOW_DAYS * 24 * 60 * 60,
    );

    const existing = await this.database.venueStrategy.findUnique({
      where: { venueId },
    });
    return this.generate(venueId, existing);
  }

  private async generate(
    venueId: string,
    existing: VenueStrategy | null,
  ): Promise<StrategyResponse> {
    const lockKey = `${GEN_LOCK_PREFIX}:${venueId}`;

    if ((await this.redis.getTtl(lockKey)) > 0) {
      if (existing) {
        return this.toResponse(existing);
      }

      throw new ServiceUnavailableException(
        'The AI strategy is still being prepared. Please try again in a minute.',
      );
    }

    await this.redis.setWithTtl(lockKey, '1', GEN_COOLDOWN_SECONDS);

    try {
      const metrics = await this.buildMetrics(venueId);
      const content = await this.gemini.generate(
        STRATEGY_SYSTEM_PROMPT,
        JSON.stringify(metrics),
      );

      const now = new Date();
      const validUntil = new Date(now.getTime() + STRATEGY_VALID_DAYS * DAY_MS);

      const saved = await this.database.venueStrategy.upsert({
        where: { venueId },
        create: {
          venueId,
          content,
          metricsSnapshot: metrics as object,
          generatedAt: now,
          validUntil,
        },
        update: {
          content,
          metricsSnapshot: metrics as object,
          generatedAt: now,
          validUntil,
        },
      });

      this.logger.log(`Generated strategy for venue ${venueId}`);
      return this.toResponse(saved);
    } catch (error) {
      this.logger.error(
        `Strategy generation failed for venue ${venueId}: ${
          error instanceof Error ? error.message : error
        }`,
      );

      if (existing) {
        return this.toResponse(existing);
      }

      const rateLimited = error instanceof GeminiError && error.status === 429;

      throw new ServiceUnavailableException(
        rateLimited
          ? 'The AI is rate-limited right now (Gemini quota exceeded). Please try again in a few minutes.'
          : 'Could not generate a strategy right now. Please try again shortly.',
      );
    }
  }

  private async buildMetrics(venueId: string): Promise<StrategyMetrics> {
    const [overview, traffic, age, campaignList] = await Promise.all([
      this.analytics.getOverview(venueId, {}),
      this.analytics.getTrafficByHour(venueId, {}),
      this.analytics.getAgeDistribution(venueId, {}),
      this.campaigns.list(venueId),
    ]);

    let lastCampaign: StrategyMetrics['lastCampaign'] = null;
    if (campaignList.length > 0) {
      const latest = campaignList[0];

      try {
        const cmp = await this.analytics.getCampaignComparison(
          venueId,
          latest.id,
        );
        lastCampaign = { name: latest.name, visitLift: cmp.visits.lift };
      } catch {
        lastCampaign = { name: latest.name, visitLift: null };
      }
    }

    const topAgeBucket =
      [...age.buckets].sort((a, b) => b.count - a.count)[0]?.bucket ?? null;

    return {
      totalVisits: overview.customers.totalVisits,
      newVisitors: overview.customers.newVisitors,
      returningVisitors: overview.customers.returningVisitors,
      conversionRate: overview.conversion.conversionRate,
      repeatRate: overview.repeat.repeatRate,
      quietHours: traffic.hours.filter(h => h.isQuiet).map(h => h.hour),
      topAgeBucket,
      lastCampaign,
    };
  }

  private async toResponse(strategy: VenueStrategy): Promise<StrategyResponse> {
    const guardKey = `${REGEN_GUARD_PREFIX}:${strategy.venueId}`;
    const ttl = await this.redis.getTtl(guardKey);
    const canRegenerate = ttl <= 0;
    return {
      content: strategy.content,
      generatedAt: strategy.generatedAt,
      validUntil: strategy.validUntil,
      canRegenerate,
      regenerateAvailableAt: canRegenerate
        ? null
        : new Date(Date.now() + ttl * 1000),
    };
  }
}
