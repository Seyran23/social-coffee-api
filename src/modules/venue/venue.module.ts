import { Module } from '@nestjs/common';

import { LoggerModule } from '@/common/logger/logger.module';
import { ChatModule } from '@/modules/chat/chat.module';
import { PresenceModule } from '@/modules/presence/presence.module';
import { VenueCleanupService } from '@/modules/venue/venue-cleanup.service';
import { VenueController } from '@/modules/venue/venue.controller';
import { VenueService } from '@/modules/venue/venue.service';

@Module({
  imports: [LoggerModule.register('Venue'), PresenceModule, ChatModule],
  controllers: [VenueController],
  providers: [VenueService, VenueCleanupService],
})
export class VenueModule {}
