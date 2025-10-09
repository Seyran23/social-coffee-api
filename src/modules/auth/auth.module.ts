import { Module } from '@nestjs/common';

import { LoggerModule } from '@/common/logger/logger.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token/token.service';

@Module({
  imports: [LoggerModule.register('Authorization')],
  controllers: [AuthController],
  providers: [AuthService, TokenService],
})
export class AuthModule {}
