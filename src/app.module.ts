import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from '@/modules/auth/auth.module';
import { ChatModule } from '@/modules/chat/chat.module';
import { FileUploadModule } from '@/modules/file-upload/file-upload.module';
import { InteractionModule } from '@/modules/interaction/interaction.module';
import { PreferenceModule } from '@/modules/preference/preference.module';
import { PresenceModule } from '@/modules/presence/presence.module';
import { ProfileModule } from '@/modules/profile/profile.module';
import { RedisModule } from '@/modules/redis/redis.module';
import { VenueModule } from '@/modules/venue/venue.module';

import { AppController } from './app.controller';
import { LoggerModule } from './common/logger/logger.module';
import { PrismaModule } from './database/prisma.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: 60000,
          limit: 1000,
        },
      ],
    }),
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    LoggerModule.register('Application'),
    PrismaModule,
    RedisModule,
    AuthModule,
    VenueModule,
    FileUploadModule,
    PreferenceModule,
    ProfileModule,
    HealthModule,
    InteractionModule,
    PresenceModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [
    ...(process.env.NODE_ENV === 'test'
      ? []
      : [
          {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
          },
        ]),
  ],
})
export class AppModule {}
