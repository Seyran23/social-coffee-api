import { Injectable, NotFoundException } from '@nestjs/common';

import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { REDIS_TTL } from '@/modules/redis/constants/time-to-live';
import { RedisService } from '@/modules/redis/redis.service';

import {
  AGE_BUCKETS,
  ANALYTICS_CACHE_PREFIX,
  CACHE_BUCKET_MS,
  MIN_BUCKET,
  QUIET_HOUR_FRACTION,
} from './constants/analytics';
import { AnalyticsQueryDto } from './dto/request/analytics-query.dto';
import { CoreMetrics } from './interfaces/core-metrics.interface';
import { percentDelta, resolvePeriods } from './utils/period';
import { round1, round4 } from './utils/rounding';

@Injectable()
export class VenueAnalyticsService {
  constructor(
    private readonly database: PrismaService,
    private readonly redis: RedisService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(VenueAnalyticsService.name);
  }

  private async cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const hit = await this.redis.getJson<T>(key);

    if (hit) {
      return hit;
    }

    const fresh = await fn();

    await this.redis.cacheJson(key, fresh, REDIS_TTL.ANALYTICS_CACHE);

    return fresh;
  }

  private key(metric: string, venueId: string, from: Date, to: Date): string {
    const bucket = (d: Date) =>
      Math.floor(d.getTime() / CACHE_BUCKET_MS) * CACHE_BUCKET_MS;
    return `${ANALYTICS_CACHE_PREFIX}:${metric}:${venueId}:${bucket(from)}:${bucket(to)}`;
  }

  private async computeCoreMetrics(
    venueId: string,
    from: Date,
    to: Date,
  ): Promise<CoreMetrics> {
    const [visitGroups, views] = await Promise.all([
      this.database.visit.groupBy({
        by: ['userId'],
        where: { venueId, visitedAt: { gte: from, lt: to } },
        _count: { _all: true },
      }),
      this.database.venueView.count({
        where: { venueId, viewedAt: { gte: from, lt: to } },
      }),
    ]);

    const distinctVisitors = visitGroups.length;
    const totalVisits = visitGroups.reduce((s, g) => s + g._count._all, 0);
    const usersWith2PlusVisits = visitGroups.filter(
      g => g._count._all >= 2,
    ).length;
    const periodUserIds = visitGroups.map(g => g.userId);

    const priorGroups = periodUserIds.length
      ? await this.database.visit.groupBy({
          by: ['userId'],
          where: {
            venueId,
            userId: { in: periodUserIds },
            visitedAt: { lt: from },
          },
        })
      : [];
    const returningVisitors = priorGroups.length;
    const newVisitors = distinctVisitors - returningVisitors;

    return {
      totalVisits,
      distinctVisitors,
      newVisitors,
      returningVisitors,
      views,
      conversionRate: views > 0 ? round4(totalVisits / views) : null,
      usersWith2PlusVisits,
      repeatRate:
        distinctVisitors > 0
          ? round4(usersWith2PlusVisits / distinctVisitors)
          : 0,
    };
  }

  getOverview(venueId: string, query: AnalyticsQueryDto) {
    const { current, previous } = resolvePeriods(query.from, query.to);
    return this.cached(
      this.key('overview', venueId, current.from, current.to),
      async () => {
        const [cur, prev] = await Promise.all([
          this.computeCoreMetrics(venueId, current.from, current.to),
          this.computeCoreMetrics(venueId, previous.from, previous.to),
        ]);

        return {
          period: { from: current.from, to: current.to },
          customers: {
            totalVisits: cur.totalVisits,
            newVisitors: cur.newVisitors,
            returningVisitors: cur.returningVisitors,
            deltaVsPrevious: percentDelta(cur.totalVisits, prev.totalVisits),
          },
          conversion: {
            views: cur.views,
            visits: cur.totalVisits,
            conversionRate: cur.conversionRate,
            deltaVsPrevious: percentDelta(
              cur.conversionRate ?? 0,
              prev.conversionRate ?? 0,
            ),
          },
          repeat: {
            distinctVisitors: cur.distinctVisitors,
            usersWith2PlusVisits: cur.usersWith2PlusVisits,
            repeatRate: cur.repeatRate,
            deltaVsPrevious: percentDelta(cur.repeatRate, prev.repeatRate),
          },
        };
      },
    );
  }

  getTrafficByHour(venueId: string, query: AnalyticsQueryDto) {
    const { current } = resolvePeriods(query.from, query.to);
    return this.cached(
      this.key('traffic-by-hour', venueId, current.from, current.to),
      async () => {
        const rows = await this.database.$queryRaw<
          { hour: number; visits: number }[]
        >`
          SELECT EXTRACT(HOUR FROM visited_at)::int AS hour,
                 COUNT(*)::int AS visits
          FROM visits
          WHERE venue_id = ${venueId}
            AND visited_at >= ${current.from}
            AND visited_at < ${current.to}
          GROUP BY hour
          ORDER BY hour;
        `;

        const periodDays = Math.max(
          1,
          Math.round(
            (current.to.getTime() - current.from.getTime()) /
              (24 * 60 * 60 * 1000),
          ),
        );

        const hours = rows.map(r => ({
          hour: r.hour,
          avgVisits: r.visits / periodDays,
        }));

        const dailyAverage = hours.length
          ? hours.reduce((s, h) => s + h.avgVisits, 0) / hours.length
          : 0;
        const quietThreshold = dailyAverage * QUIET_HOUR_FRACTION;

        return {
          dailyAverage: round1(dailyAverage),
          quietThreshold: round1(quietThreshold),
          hours: hours.map(h => ({
            hour: h.hour,
            avgVisits: round1(h.avgVisits),
            isQuiet: h.avgVisits < quietThreshold,
          })),
        };
      },
    );
  }

  getAgeDistribution(venueId: string, query: AnalyticsQueryDto) {
    const { current } = resolvePeriods(query.from, query.to);
    return this.cached(
      this.key('age-distribution', venueId, current.from, current.to),
      async () => {
        const rows = await this.database.$queryRaw<
          { bucket: string; count: number }[]
        >`
          SELECT bucket, COUNT(DISTINCT user_id)::int AS count
          FROM (
            SELECT
              people.user_id AS user_id,
              CASE
                WHEN people.age BETWEEN 18 AND 24 THEN '18-24'
                WHEN people.age BETWEEN 25 AND 30 THEN '25-30'
                WHEN people.age BETWEEN 31 AND 40 THEN '31-40'
                WHEN people.age >= 41 THEN '41+'
                ELSE 'undisclosed'
              END AS bucket
            FROM (
              SELECT DISTINCT v.user_id AS user_id,
                     DATE_PART('year', AGE(u.birth_date))::int AS age
              FROM visits v
              JOIN users u ON u.id = v.user_id
              WHERE v.venue_id = ${venueId}
                AND v.visited_at >= ${current.from}
                AND v.visited_at < ${current.to}
            ) people
          ) labeled
          GROUP BY bucket;
        `;

        const known: Record<string, number> = {};
        let undisclosed = 0;
        for (const row of rows) {
          if (row.bucket === 'undisclosed') {
            undisclosed += row.count;
          } else if (row.count >= MIN_BUCKET) {
            known[row.bucket] = row.count;
          } else {
            undisclosed += row.count;
          }
        }

        return {
          buckets: AGE_BUCKETS.filter(b => known[b] != null).map(b => ({
            bucket: b,
            count: known[b],
          })),
          undisclosed,
        };
      },
    );
  }

  getActiveUsers(venueId: string, query: AnalyticsQueryDto) {
    const { current } = resolvePeriods(query.from, query.to);
    return this.cached(
      this.key('active-users', venueId, current.from, current.to),
      async () => {
        const rows = await this.database.$queryRaw<
          { date: Date; count: number }[]
        >`
          SELECT day AS date, COUNT(DISTINCT user_id)::int AS count
          FROM (
            SELECT date_trunc('day', visited_at) AS day, user_id
            FROM visits
            WHERE venue_id = ${venueId}
              AND visited_at >= ${current.from}
              AND visited_at < ${current.to}
            UNION
            SELECT date_trunc('day', viewed_at) AS day, user_id
            FROM venue_views
            WHERE venue_id = ${venueId}
              AND viewed_at >= ${current.from}
              AND viewed_at < ${current.to}
          ) activity
          GROUP BY day
          ORDER BY day;
        `;

        return { series: rows.map(r => ({ date: r.date, count: r.count })) };
      },
    );
  }

  async getCampaignComparison(venueId: string, campaignId: string) {
    const campaign = await this.database.campaign.findFirst({
      where: { id: campaignId, venueId },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    const spanMs = campaign.endDate.getTime() - campaign.startDate.getTime();
    const beforeFrom = new Date(campaign.startDate.getTime() - spanMs);

    const [after, before] = await Promise.all([
      this.computeCoreMetrics(venueId, campaign.startDate, campaign.endDate),
      this.computeCoreMetrics(venueId, beforeFrom, campaign.startDate),
    ]);

    const metric = (b: number, a: number) => ({
      before: b,
      after: a,
      lift: percentDelta(a, b),
    });

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        offer: campaign.offer,
      },
      visits: metric(before.totalVisits, after.totalVisits),
      conversionRate: metric(
        before.conversionRate ?? 0,
        after.conversionRate ?? 0,
      ),
      repeatRate: metric(before.repeatRate, after.repeatRate),
    };
  }
}
