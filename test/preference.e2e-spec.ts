import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { bearerAuth, registerTestUser } from './helpers/auth.helper';
import { clearAll, disconnectDb } from './helpers/db.helper';
import { closeApp, getApp } from './helpers/test-app.helper';

describe('Preference (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  const validDto = {
    minAge: 20,
    maxAge: 35,
    preferredGender: 'FEMALE',
    lookingFor: ['FRIENDSHIP', 'COFFEE_CHAT'],
  };

  beforeAll(async () => {
    app = await getApp();
  });

  beforeEach(async () => {
    await clearAll();
    const user = await registerTestUser(app);
    accessToken = user.accessToken;
  });

  afterAll(async () => {
    await clearAll();
    await disconnectDb();
    await closeApp();
  });

  // ─── EXISTS ───────────────────────────────────────────────────────────────

  describe('GET /api/v1/preferences/me/exists', () => {
    it('should return false when no preference has been set yet', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/preferences/me/exists')
        .set(bearerAuth(accessToken))
        .expect(200);

      expect(res.body.data.exists).toBe(false);
    });

    it('should return true after preferences are set', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/preferences/me')
        .set(bearerAuth(accessToken))
        .send(validDto)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/preferences/me/exists')
        .set(bearerAuth(accessToken))
        .expect(200);

      expect(res.body.data.exists).toBe(true);
    });
  });

  // ─── GET ──────────────────────────────────────────────────────────────────

  describe('GET /api/v1/preferences/me', () => {
    it('should return 404 when preferences do not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/preferences/me')
        .set(bearerAuth(accessToken))
        .expect(404);
    });

    it('should return preferences after they are set', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/preferences/me')
        .set(bearerAuth(accessToken))
        .send(validDto);

      const res = await request(app.getHttpServer())
        .get('/api/v1/preferences/me')
        .set(bearerAuth(accessToken))
        .expect(200);

      expect(res.body.data.minAge).toBe(validDto.minAge);
      expect(res.body.data.maxAge).toBe(validDto.maxAge);
      expect(res.body.data.preferredGender).toBe(validDto.preferredGender);
    });
  });

  // ─── UPSERT ───────────────────────────────────────────────────────────────

  describe('PUT /api/v1/preferences/me', () => {
    it('should create preferences successfully', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/preferences/me')
        .set(bearerAuth(accessToken))
        .send(validDto)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.minAge).toBe(validDto.minAge);
    });

    it('should update existing preferences', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/preferences/me')
        .set(bearerAuth(accessToken))
        .send(validDto);

      const res = await request(app.getHttpServer())
        .put('/api/v1/preferences/me')
        .set(bearerAuth(accessToken))
        .send({ ...validDto, minAge: 25, maxAge: 40 })
        .expect(200);

      expect(res.body.data.minAge).toBe(25);
      expect(res.body.data.maxAge).toBe(40);
    });

    it('should return 400 when minAge > maxAge', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/preferences/me')
        .set(bearerAuth(accessToken))
        .send({ ...validDto, minAge: 40, maxAge: 20 })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/preferences/me')
        .send(validDto)
        .expect(401);
    });
  });

  // ─── DELETE ───────────────────────────────────────────────────────────────

  describe('DELETE /api/v1/preferences/me', () => {
    it('should delete preferences successfully', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/preferences/me')
        .set(bearerAuth(accessToken))
        .send(validDto);

      const res = await request(app.getHttpServer())
        .delete('/api/v1/preferences/me')
        .set(bearerAuth(accessToken))
        .expect(200);

      expect(res.body.success).toBe(true);

      // Should no longer exist
      await request(app.getHttpServer())
        .get('/api/v1/preferences/me')
        .set(bearerAuth(accessToken))
        .expect(404);
    });

    it('should return 404 when deleting nonexistent preferences', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/preferences/me')
        .set(bearerAuth(accessToken))
        .expect(404);
    });
  });
});
