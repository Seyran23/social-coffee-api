import { Module } from '@nestjs/common';

import { LoggerModule } from '@/common/logger/logger.module';
import { VenueController } from '@/modules/venue/venue.controller';
import { VenueService } from '@/modules/venue/venue.service';

@Module({
  imports: [LoggerModule.register('Venue')],
  controllers: [VenueController],
  providers: [VenueService],
})
export class VenueModule {}
