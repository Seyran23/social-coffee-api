import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';

import { LoggerModule } from '@/common/logger/logger.module';
import { WsAuthMiddleware } from '@/common/middleware/websocket-auth.middleware';
import { WsRateLimitMiddleware } from '@/common/middleware/websocket-rate-limit.middleware';
import { ChatGateway } from '@/modules/chat/chat.gateway';
import { ChatService } from '@/modules/chat/chat.service';

import { ChatController } from './chat.controller';

@Module({
  imports: [
    LoggerModule.register('Chat'),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.getOrThrow<number>('JWT_ACCESS_EXPIRATION'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    ChatGateway,
    ChatService,
    WsAuthMiddleware,
    WsRateLimitMiddleware,
  ],
  exports: [ChatService, ChatGateway],
  controllers: [ChatController],
})
export class ChatModule {}
