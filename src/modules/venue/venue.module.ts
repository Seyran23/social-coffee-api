import { Module } from '@nestjs/common';

import { VenueController } from './venue.controller';
import { VenueService } from './venue.service';

@Module({
  controllers: [VenueController],
  providers: [VenueService],
})
export class VenueModule {}
