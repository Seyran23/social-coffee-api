import { Module } from '@nestjs/common';

import { LoggerModule } from '@/common/logger/logger.module';
import { UserController } from '@/modules/user/user.controller';
import { UserService } from '@/modules/user/user.service';

@Module({
  imports: [LoggerModule.register('User')],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
