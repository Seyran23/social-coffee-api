import { Module } from '@nestjs/common';

import { LoggerModule } from '@/common/logger/logger.module';

import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [LoggerModule.register('Profile')],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
