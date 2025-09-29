import {
  Injectable,
  LoggerService as NestLoggerService,
  Scope,
} from '@nestjs/common';
import { Logger as WinstonLogger } from 'winston';

import { createLogger } from './config';

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService implements NestLoggerService {
  private readonly logger: WinstonLogger;
  private context?: string;

  constructor(context?: string) {
    this.logger = createLogger();
    this.context = context;
  }

  setContext(context: string): void {
    this.context = context;
  }

  log(message: string, context?: string): void {
    this.logger.info(message, { context: context ?? this.context });
  }

  info(
    message: string,
    context?: string,
    meta?: Record<string, unknown>,
  ): void {
    this.logger.info(message, { context: context ?? this.context, ...meta });
  }

  error(
    message: string,
    trace?: string,
    context?: string,
    meta?: Record<string, unknown>,
  ): void {
    this.logger.error(message, {
      stack: trace,
      context: context ?? this.context,
      ...meta,
    });
  }

  warn(
    message: string,
    context?: string,
    meta?: Record<string, unknown>,
  ): void {
    this.logger.warn(message, { context: context ?? this.context, ...meta });
  }

  debug(
    message: string,
    context?: string,
    meta?: Record<string, unknown>,
  ): void {
    this.logger.debug(message, { context: context ?? this.context, ...meta });
  }

  verbose(
    message: string,
    context?: string,
    meta?: Record<string, unknown>,
  ): void {
    this.logger.verbose(message, { context: context ?? this.context, ...meta });
  }

  child(context: string): LoggerService {
    return new LoggerService(context);
  }
}
