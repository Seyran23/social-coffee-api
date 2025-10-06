import { Global, Module } from '@nestjs/common';

import { LoggerModule } from '@/common/logger/logger.module';

import { PrismaService } from './prisma.service';

@Global()
@Module({
  imports: [LoggerModule.register('PrismaService')],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
