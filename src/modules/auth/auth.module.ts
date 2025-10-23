import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { LoggerModule } from '@/common/logger/logger.module';
import { JwtAccessStrategy } from '@/modules/auth/strategies/jwt-access.strategy';
import { JwtRefreshStrategy } from '@/modules/auth/strategies/jwt-refresh.strategy';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token/token.service';

@Module({
  imports: [
    LoggerModule.register('Authorization'),
    JwtModule.register({}),
    PassportModule.register({ defaultStrategy: 'jwt-access' }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtRefreshStrategy, JwtAccessStrategy],
})
export class AuthModule {}
