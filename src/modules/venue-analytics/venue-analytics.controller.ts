import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { Roles } from '@/common/decorators/roles.decorator';
import { ApiCommonErrorResponses } from '@/common/decorators/swagger.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { VenueOwnershipGuard } from '@/common/guards/venue-ownership.guard';
import { ResponseBuilder } from '@/common/utils/response-builder';

import { CampaignService } from './campaign.service';
import { AnalyticsQueryDto } from './dto/request/analytics-query.dto';
import { CreateCampaignDto } from './dto/request/create-campaign.dto';
import { StrategyService } from './strategy/strategy.service';
import { VenueAnalyticsService } from './venue-analytics.service';

@ApiTags('Venue Analytics')
@Controller('venues/:venueId')
@UseGuards(JwtAuthGuard, RolesGuard, VenueOwnershipGuard)
@Roles(Role.CAFE_MANAGER, Role.ADMIN)
@ApiBearerAuth('jwt')
@ApiCommonErrorResponses()
export class VenueAnalyticsController {
  constructor(
    private readonly analytics: VenueAnalyticsService,
    private readonly campaigns: CampaignService,
    private readonly strategy: StrategyService,
  ) {}

  @Get('analytics/overview')
  @ApiOperation({
    summary: 'Dashboard overview',
    description:
      'Headline numbers: customers (foot traffic), conversion rate, repeat rate — each with a % change vs the previous equal-length window.',
  })
  @ApiResponse({ status: 200, description: 'Overview metrics' })
  async getOverview(
    @Param('venueId') venueId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    const data = await this.analytics.getOverview(venueId, query);
    return ResponseBuilder.success(data, 'Overview retrieved successfully');
  }

  @Get('analytics/traffic-by-hour')
  @ApiOperation({
    summary: 'Traffic by hour (quiet hours)',
    description:
      'Average visits per hour of day across the period, with quiet hours (below 50% of the daily average) flagged.',
  })
  @ApiResponse({ status: 200, description: 'Hourly traffic with quiet flags' })
  async getTrafficByHour(
    @Param('venueId') venueId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    const data = await this.analytics.getTrafficByHour(venueId, query);
    return ResponseBuilder.success(data, 'Traffic by hour retrieved');
  }

  @Get('analytics/age-distribution')
  @ApiOperation({
    summary: 'Age distribution',
    description:
      'Distinct visitors bucketed by age. Any bucket with fewer than 5 people is suppressed into "undisclosed" (k-anonymity).',
  })
  @ApiResponse({ status: 200, description: 'Age buckets (floor-applied)' })
  async getAgeDistribution(
    @Param('venueId') venueId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    const data = await this.analytics.getAgeDistribution(venueId, query);
    return ResponseBuilder.success(data, 'Age distribution retrieved');
  }

  @Get('analytics/active-users')
  @ApiOperation({
    summary: 'Active users over time',
    description:
      'Distinct users who visited or viewed the venue, per day, across the period.',
  })
  @ApiResponse({ status: 200, description: 'Daily active-user series' })
  async getActiveUsers(
    @Param('venueId') venueId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    const data = await this.analytics.getActiveUsers(venueId, query);
    return ResponseBuilder.success(data, 'Active users retrieved');
  }

  @Get('analytics/campaign/:campaignId')
  @ApiOperation({
    summary: 'Campaign impact (before/after)',
    description:
      'Per-metric comparison (visits, conversion, repeat rate) of the campaign window vs the equal-length window immediately before it.',
  })
  @ApiResponse({ status: 200, description: 'Before/after per metric' })
  async getCampaignComparison(
    @Param('venueId') venueId: string,
    @Param('campaignId') campaignId: string,
  ) {
    const data = await this.analytics.getCampaignComparison(
      venueId,
      campaignId,
    );
    return ResponseBuilder.success(data, 'Campaign comparison retrieved');
  }

  @Post('campaigns')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a campaign',
    description:
      'Create a campaign for this venue. Check-in visits during its window are attributed to it for the before/after report.',
  })
  @ApiResponse({ status: 201, description: 'Campaign created' })
  async createCampaign(
    @Param('venueId') venueId: string,
    @Body() dto: CreateCampaignDto,
  ) {
    const campaign = await this.campaigns.create(venueId, dto);
    return ResponseBuilder.success(
      campaign,
      'Campaign created successfully',
      HttpStatus.CREATED,
    );
  }

  @Get('campaigns')
  @ApiOperation({
    summary: 'List campaigns',
    description: 'All campaigns for this venue, newest first.',
  })
  @ApiResponse({ status: 200, description: 'Campaign list' })
  async listCampaigns(@Param('venueId') venueId: string) {
    const campaigns = await this.campaigns.list(venueId);
    return ResponseBuilder.success(campaigns, 'Campaigns retrieved');
  }

  @Get('strategy')
  @ApiOperation({
    summary: 'AI strategy',
    description:
      'An AI-generated monthly growth strategy from the venue’s metrics. Returns the cached copy while valid, otherwise generates and stores a fresh one.',
  })
  @ApiResponse({ status: 200, description: 'Strategy (markdown) + validity' })
  async getStrategy(@Param('venueId') venueId: string) {
    const data = await this.strategy.getStrategy(venueId);
    return ResponseBuilder.success(data, 'Strategy retrieved');
  }

  @Post('strategy/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Regenerate the AI strategy',
    description:
      'Force a fresh strategy and restart the monthly clock. Rate-limited to one manual regenerate per 7 days per venue; when rate-limited, returns the current strategy with the next-available time.',
  })
  @ApiResponse({ status: 200, description: 'Strategy (possibly rate-limited)' })
  async regenerateStrategy(@Param('venueId') venueId: string) {
    const data = await this.strategy.regenerate(venueId);
    return ResponseBuilder.success(data, 'Strategy regenerated');
  }
}
