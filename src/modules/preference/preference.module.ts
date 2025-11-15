import { Module } from '@nestjs/common';

import { LoggerModule } from '@/common/logger/logger.module';
import { PreferenceController } from '@/modules/preference/preference.controller';
import { PreferenceService } from '@/modules/preference/preference.service';

@Module({
  imports: [LoggerModule.register('Preference')],
  controllers: [PreferenceController],
  providers: [PreferenceService],
})
export class PreferenceModule {}
