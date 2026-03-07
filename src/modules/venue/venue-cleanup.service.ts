import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { LoggerService } from '@/common/logger/logger.service';
import { VENUE_CLEANUP } from '@/modules/venue/constants/cleanup';
import { PresenceGateway } from '@/modules/presence/presence.gateway';
import { RedisService } from '@/modules/redis/redis.service';


@Injectable()
export class VenueCleanupService {
    constructor(
        private readonly redis: RedisService,
        private readonly presenceGateway: PresenceGateway,
        private readonly logger: LoggerService,
    ) {
        this.logger.setContext(VenueCleanupService.name);
    }

    @Interval(VENUE_CLEANUP.INTERVAL_MS)
    async removeStaleVenueUsers(): Promise<void> {
        const venueIds = await this.redis.getActiveVenueIds();

        if (venueIds.length === 0) {
            return;
        }

        this.logger.debug(
            `[CLEANUP] Checking ${venueIds.length} active venue(s) for stale users`,
        );

        for (const venueId of venueIds) {
            await this.cleanupVenue(venueId);
        }
    }

    private async cleanupVenue(venueId: string): Promise<void> {
        const users = await this.redis.getUsersAtVenue(venueId);

        for (const userId of users) {
            const isActive = await this.redis.isUserActive(userId);

            if (!isActive) {
                await this.redis.removeUserFromVenue(userId, venueId);
                await this.presenceGateway.broadcastUserLeft(userId, venueId);

                this.logger.log(
                    `[CLEANUP] Removed stale user ${userId} from venue ${venueId}`,
                );
            }
        }
    }
}
