import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeApp, getApp } from './helpers/test-app.helper';

describe('Application (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await getApp();
  });

  afterAll(async () => {
    await closeApp();
  });

  it('/health (GET) returns liveness payload', async () => {
    // Health controller is excluded from the global 'api' prefix but URI
    // versioning still applies, so the route is /v1/health.
    const res = await request(app.getHttpServer())
      .get('/v1/health')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.uptime).toBeDefined();
    expect(res.body.data.version).toBeDefined();
  });

  it('/health/live (GET) returns 200', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/health/live')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.uptime).toBeDefined();
  });

  it('/health/ready (GET) reports DB + Redis status', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/health/ready')
      .expect(200);

    // The global ResponseInterceptor wraps the terminus payload under `data`.
    // Terminus shape: { status: 'ok', info: { database: { status: 'up' }, redis: { ... } } }
    const ready = res.body.data ?? res.body;
    expect(ready.status).toBe('ok');
    expect(ready.info.database.status).toBe('up');
    expect(ready.info.redis.status).toBe('up');
  });
});
