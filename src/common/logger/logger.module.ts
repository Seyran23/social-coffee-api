import { DynamicModule, Global, Module } from '@nestjs/common';

import { LoggerService } from './logger.service';

@Global()
@Module({})
export class LoggerModule {
  static forRoot(): DynamicModule {
    return {
      module: LoggerModule,
      providers: [
        {
          provide: LoggerService,
          useFactory: () => new LoggerService('Application'),
        },
      ],
      exports: [LoggerService],
    };
  }

  static forFeature(context: string): DynamicModule {
    return {
      module: LoggerModule,
      providers: [
        {
          provide: LoggerService,
          useFactory: () => new LoggerService(context),
        },
      ],
      exports: [LoggerService],
    };
  }
}
