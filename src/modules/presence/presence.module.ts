import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { LoggerModule } from '@/common/logger/logger.module';
import { WsAuthMiddleware } from '@/common/middleware/websocket-auth.middleware';
import { WsRateLimitMiddleware } from '@/common/middleware/websocket-rate-limit.middleware';
import { ProfileModule } from '@/modules/profile/profile.module';

import { PresenceGateway } from './presence.gateway';
import { PresenceService } from './presence.service';

@Module({
  imports: [LoggerModule.register('Presence'), JwtModule, ProfileModule],
  providers: [
    PresenceGateway,
    PresenceService,
    WsAuthMiddleware,
    WsRateLimitMiddleware,
  ],
  exports: [PresenceGateway],
})
export class PresenceModule {}
