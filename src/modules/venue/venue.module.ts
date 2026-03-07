import { Module } from '@nestjs/common';

import { LoggerModule } from '@/common/logger/logger.module';
import { PresenceModule } from '@/modules/presence/presence.module';
import { VenueCleanupService } from '@/modules/venue/venue-cleanup.service';
import { VenueController } from '@/modules/venue/venue.controller';
import { VenueService } from '@/modules/venue/venue.service';

@Module({
  imports: [LoggerModule.register('Venue'), PresenceModule],
  controllers: [VenueController],
  providers: [VenueService, VenueCleanupService],
})
export class VenueModule { }

