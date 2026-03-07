import { Module } from '@nestjs/common';

import { LoggerModule } from '@/common/logger/logger.module';
import { ChatModule } from '@/modules/chat/chat.module';
import { InteractionController } from '@/modules/interaction/interaction.controller';
import { InteractionService } from '@/modules/interaction/interaction.service';

import { PresenceModule } from '../presence/presence.module';

@Module({
  imports: [LoggerModule.register('Interaction'), ChatModule, PresenceModule],
  controllers: [InteractionController],
  providers: [InteractionService],
  exports: [InteractionService],
})
export class InteractionModule {}
