import {
  ValidationPipe,
  VersioningType,
  INestApplication,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { AppModule } from '@/app.module';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { ResponseInterceptor } from '@/common/interceptors/response.interceptor';

let app: INestApplication;

/**
 * Boots the NestJS app once and reuses the same instance across all E2E suites.
 * Call getApp() in your beforeAll() hooks.
 */
export async function getApp(): Promise<INestApplication> {
  if (app) {
    return app;
  }

  app = await NestFactory.create(AppModule, {
    // Suppress logs during tests to keep output clean
    logger: false,
  });

  app.setGlobalPrefix('api', {
    exclude: ['health', 'health/live', 'health/ready'],
  });

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      stopAtFirstError: false,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // listen(0) lets the OS pick a free port; required for socket.io clients
  // to connect via URL. Supertest continues to work with app.getHttpServer().
  await app.listen(0);

  return app;
}

/**
 * Tears down the NestJS app. Call in afterAll() of the LAST suite only,
 * or simply use this in each suite's afterAll to be safe — NestJS handles
 * repeated close() calls gracefully.
 */
export async function closeApp(): Promise<void> {
  if (app) {
    await app.close();
    // Reset so the next suite can start fresh if needed
    app = null as unknown as INestApplication;
  }
}
