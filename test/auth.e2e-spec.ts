import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { bearerAuth, registerTestUser } from './helpers/auth.helper';
import { clearUserData, disconnectDb } from './helpers/db.helper';
import { closeApp, getApp } from './helpers/test-app.helper';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await getApp();
  });

  beforeEach(async () => {
    await clearUserData();
  });

  afterAll(async () => {
    await clearUserData();
    await disconnectDb();
    await closeApp();
  });

  // ─── REGISTER ─────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user and return access token + set refresh cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          firstName: 'Alice',
          lastName: 'Smith',
          email: 'alice@test.com',
          password: 'Password123!',
          birthDate: '1995-06-15',
          gender: 'FEMALE',
          bio: 'Hello, I am Alice.',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.email).toBe('alice@test.com');

      // Refresh token should be in Set-Cookie
      const cookie = res.headers['set-cookie'] as unknown as string[];
      expect(cookie.join(';')).toContain('refreshToken=');
    });

    it('should return 409 when email already exists', async () => {
      await registerTestUser(app, { email: 'duplicate@test.com' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          firstName: 'Bob',
          lastName: 'Jones',
          email: 'duplicate@test.com',
          password: 'Password123!',
          birthDate: '1995-06-15',
          gender: 'MALE',
          bio: 'Duplicate user.',
        })
        .expect(409);

      expect(res.body.success).toBe(false);
    });

    it('should return 400 for invalid registration data', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: '123' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ─── LOGIN ────────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('should login successfully and return tokens', async () => {
      const { email } = await registerTestUser(app);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'Password123!' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('should return 401 for wrong password', async () => {
      const { email } = await registerTestUser(app);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'WrongPass999!' })
        .expect(401);
    });

    it('should return 401 for non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@test.com', password: 'Password123!' })
        .expect(401);
    });
  });

  // ─── REFRESH ──────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/refresh', () => {
    it('should return a new access token using the refresh cookie', async () => {
      const { refreshToken } = await registerTestUser(app);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
    });

    it('should return 401 with an invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refreshToken=fake-invalid-token`)
        .expect(401);
    });
  });

  // ─── LOGOUT ───────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/logout', () => {
    it('should log out and clear the refresh cookie', async () => {
      const { refreshToken } = await registerTestUser(app);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      // Refresh token should be invalidated — second refresh should fail
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(401);
    });
  });

  // ─── LOGOUT ALL DEVICES ───────────────────────────────────────────────────

  describe('POST /api/v1/auth/logout-all', () => {
    it('should invalidate all refresh tokens for the user', async () => {
      const { refreshToken } = await registerTestUser(app);

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout-all')
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(200);

      // All sessions should now be invalid
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refreshToken=${refreshToken}`)
        .expect(401);
    });
  });

  // ─── FORGOT PASSWORD ──────────────────────────────────────────────────────

  describe('POST /api/v1/auth/forgot-password', () => {
    it('should return 200 even when email does not exist (security by design)', async () => {
      const { accessToken } = await registerTestUser(app);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .set(bearerAuth(accessToken))
        .send({ email: 'nonexistent@test.com' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ─── RESET PASSWORD ───────────────────────────────────────────────────────

  describe('POST /api/v1/auth/reset-password/:token', () => {
    it('should reset password with valid token and allow login with new password', async () => {
      const { accessToken, email } = await registerTestUser(app);

      const forgotRes = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .set(bearerAuth(accessToken))
        .send({ email })
        .expect(200);

      const resetToken = forgotRes.body.data.resetToken;
      expect(resetToken).toBeDefined();

      await request(app.getHttpServer())
        .post(`/api/v1/auth/reset-password/${resetToken}`)
        .send({ newPassword: 'NewPassword456!' })
        .expect(200);

      // Old password should no longer work
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'Password123!' })
        .expect(401);

      // New password should work
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'NewPassword456!' })
        .expect(200);

      expect(loginRes.body.success).toBe(true);
      expect(loginRes.body.data.accessToken).toBeDefined();
    });

    it('should return 400 with an invalid reset token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password/totally-invalid-token')
        .send({ newPassword: 'NewPassword456!' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });
});
