import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { bearerAuth, registerTestUser } from './helpers/auth.helper';
import { clearAll, disconnectDb, prisma } from './helpers/db.helper';
import { closeApp, getApp } from './helpers/test-app.helper';

describe('Profile (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

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

  // ─── GET MY PROFILE ───────────────────────────────────────────────────────

  describe('GET /api/v1/profiles/me', () => {
    it('should return own profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/profiles/me')
        .set(bearerAuth(accessToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.firstName).toBe('Test');
      expect(res.body.data.lastName).toBe('User');
      expect(res.body.data).not.toHaveProperty('password');
    });

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer()).get('/api/v1/profiles/me').expect(401);
    });
  });

  // ─── UPDATE MY PROFILE ────────────────────────────────────────────────────

  describe('PATCH /api/v1/profiles/me', () => {
    it('should update profile bio', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/profiles/me')
        .set(bearerAuth(accessToken))
        .send({ bio: 'Updated bio for testing.' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.bio).toBe('Updated bio for testing.');
    });

    it('should update profile firstName', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/profiles/me')
        .set(bearerAuth(accessToken))
        .send({ firstName: 'Alice' })
        .expect(200);

      expect(res.body.data.firstName).toBe('Alice');
    });

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/profiles/me')
        .send({ bio: 'No token.' })
        .expect(401);
    });
  });

  // ─── FEED (DISCOVER) ──────────────────────────────────────────────────────

  describe('GET /api/v1/profiles/feed', () => {
    it('should return 400 when user is not checked in to any venue', async () => {
      // By default, a freshly registered user has no venue check-in
      const res = await request(app.getHttpServer())
        .get('/api/v1/profiles/feed')
        .set(bearerAuth(accessToken))
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/profiles/feed')
        .expect(401);
    });

    it('should return empty profiles array when checked in but alone at venue', async () => {
      const venue = await prisma.venue.create({
        data: {
          name: 'Solo Cafe',
          mapUrl: 'https://maps.google.com/?q=41.0,28.0',
          latitude: 41.0,
          longitude: 28.0,
          status: 'ACTIVE',
        },
      });

      await request(app.getHttpServer())
        .post(`/api/v1/venues/${venue.id}/checkin`)
        .set(bearerAuth(accessToken))
        .send({ latitude: 41.0, longitude: 28.0 });

      const res = await request(app.getHttpServer())
        .get('/api/v1/profiles/feed')
        .set(bearerAuth(accessToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.profiles).toHaveLength(0);
      expect(res.body.data.total).toBe(0);
    });

    describe('when multiple users are checked in', () => {
      let user2Id: string;
      let user2Token: string;
      let venueId: string;

      beforeEach(async () => {
        const venue = await prisma.venue.create({
          data: {
            name: 'Feed Test Cafe',
            mapUrl: 'https://maps.google.com/?q=41.0,28.0',
            latitude: 41.0,
            longitude: 28.0,
            status: 'ACTIVE',
          },
        });
        venueId = venue.id;

        const user2 = await registerTestUser(app);
        user2Id = user2.user.id;
        user2Token = user2.accessToken;

        const coords = { latitude: 41.0, longitude: 28.0 };
        await request(app.getHttpServer())
          .post(`/api/v1/venues/${venueId}/checkin`)
          .set(bearerAuth(accessToken))
          .send(coords);
        await request(app.getHttpServer())
          .post(`/api/v1/venues/${venueId}/checkin`)
          .set(bearerAuth(user2Token))
          .send(coords);
      });

      it('should return profiles of other users checked in at the same venue', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/v1/profiles/feed')
          .set(bearerAuth(accessToken))
          .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.profiles.length).toBeGreaterThan(0);
        expect(res.body.data.profiles[0].id).toBe(user2Id);
        expect(res.body.data.total).toBeGreaterThan(0);
      });

      it('should not include the requesting user in their own feed', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/v1/profiles/feed')
          .set(bearerAuth(accessToken))
          .expect(200);

        const ids: string[] = res.body.data.profiles.map(
          (p: { id: string }) => p.id,
        );
        const myProfile = await prisma.user.findFirst({
          where: { id: { not: user2Id } },
        });
        expect(ids).not.toContain(myProfile?.id);
      });
    });
  });

  // ─── DELETE PROFILE IMAGE ─────────────────────────────────────────────────

  describe('DELETE /api/v1/profiles/me/image', () => {
    it('should return 400 when user has no profile image to delete', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/v1/profiles/me/image')
        .set(bearerAuth(accessToken))
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/profiles/me/image')
        .expect(401);
    });
  });
});
