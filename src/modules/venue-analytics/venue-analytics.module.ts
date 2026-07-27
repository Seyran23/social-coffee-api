import { Module } from '@nestjs/common';

import { LoggerModule } from '@/common/logger/logger.module';

import { CampaignService } from './campaign.service';
import { GeminiService } from './strategy/gemini.service';
import { StrategyService } from './strategy/strategy.service';
import { VenueAnalyticsController } from './venue-analytics.controller';
import { VenueAnalyticsService } from './venue-analytics.service';

@Module({
  imports: [LoggerModule.register('VenueAnalytics')],
  controllers: [VenueAnalyticsController],
  providers: [
    VenueAnalyticsService,
    CampaignService,
    StrategyService,
    GeminiService,
  ],
})
export class VenueAnalyticsModule {}
