import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { bearerAuth, registerTestUser } from './helpers/auth.helper';
import { clearAll, disconnectDb, prisma } from './helpers/db.helper';
import { closeApp, getApp } from './helpers/test-app.helper';

describe('Interaction (e2e)', () => {
  let app: INestApplication;
  let user1Token: string;
  let user1Id: string;
  let user2Token: string;
  let user2Id: string;
  let user3Token: string;
  let venueId: string;

  beforeAll(async () => {
    app = await getApp();
  });

  beforeEach(async () => {
    await clearAll();

    // Create an admin user is NO LONGER needed since we skip the venue creation endpoint
    // Create venue directly in DB to avoid hitting real Google Maps endpoint inside tests and getting blocked
    const venue = await prisma.venue.create({
      data: {
        name: 'Interaction Cafe',
        mapUrl: 'https://maps.google.com/?q=41.0082376,28.9783589',
        latitude: 41.0082376,
        longitude: 28.9783589,
        geofenceMeters: 200,
        status: 'ACTIVE',
      },
    });
    venueId = venue.id;

    // Create regular users
    const user1 = await registerTestUser(app);
    user1Token = user1.accessToken;
    user1Id = user1.user.id;

    const user2 = await registerTestUser(app);
    user2Token = user2.accessToken;
    user2Id = user2.user.id;

    const user3 = await registerTestUser(app);
    user3Token = user3.accessToken;

    // Check users into the venue
    const location = { latitude: 41.0082376, longitude: 28.9783589 };
    await request(app.getHttpServer())
      .post(`/api/v1/venues/${venueId}/checkin`)
      .set(bearerAuth(user1Token))
      .send(location);

    await request(app.getHttpServer())
      .post(`/api/v1/venues/${venueId}/checkin`)
      .set(bearerAuth(user2Token))
      .send(location);

    await request(app.getHttpServer())
      .post(`/api/v1/venues/${venueId}/checkin`)
      .set(bearerAuth(user3Token))
      .send(location);
  });

  afterAll(async () => {
    await clearAll();
    await disconnectDb();
    await closeApp();
  });

  // ─── POST /api/v1/interactions/like ───────────────────────────────────────

  describe('POST /api/v1/interactions/like', () => {
    it('should successfully like another user at the same venue', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/interactions/like')
        .set(bearerAuth(user1Token))
        .send({ targetUserId: user2Id, venueId })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.matched).toBe(false);
    });

    it('should result in a match if the target has already liked the source', async () => {
      // User 2 likes User 1 first
      await request(app.getHttpServer())
        .post('/api/v1/interactions/like')
        .set(bearerAuth(user2Token))
        .send({ targetUserId: user1Id, venueId })
        .expect(201);

      // User 1 likes User 2
      const res = await request(app.getHttpServer())
        .post('/api/v1/interactions/like')
        .set(bearerAuth(user1Token))
        .send({ targetUserId: user2Id, venueId })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.matched).toBe(true);
      expect(res.body.data.chatSession).toBeDefined();
      expect(res.body.data.chatSession.id).toBeDefined();
    });

    it('should return 400 when trying to like oneself', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/interactions/like')
        .set(bearerAuth(user1Token))
        .send({ targetUserId: user1Id, venueId })
        .expect(400);
    });

    it('should return 409 when liking a user that is already liked', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/interactions/like')
        .set(bearerAuth(user1Token))
        .send({ targetUserId: user2Id, venueId })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/interactions/like')
        .set(bearerAuth(user1Token))
        .send({ targetUserId: user2Id, venueId })
        .expect(409);

      expect(res.body.success).toBe(false);
    });

    it('should return 401 when no auth token is provided', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/interactions/like')
        .send({ targetUserId: user2Id, venueId })
        .expect(401);
    });
  });

  // ─── GET /api/v1/interactions/my-likes ────────────────────────────────────

  describe('GET /api/v1/interactions/my-likes', () => {
    it('should retrieve a list of users I have liked', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/interactions/like')
        .set(bearerAuth(user1Token))
        .send({ targetUserId: user2Id, venueId });

      const res = await request(app.getHttpServer())
        .get('/api/v1/interactions/my-likes')
        .set(bearerAuth(user1Token))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].user.id).toBe(user2Id);
    });

    it('should return empty list if no likes', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/interactions/my-likes')
        .set(bearerAuth(user1Token))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(0);
    });

    it('should return 401 when no auth token is provided', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/interactions/my-likes')
        .expect(401);
    });
  });

  // ─── GET /api/v1/interactions/liked-me ────────────────────────────────────

  describe('GET /api/v1/interactions/liked-me', () => {
    it('should retrieve a list of users who liked me', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/interactions/like')
        .set(bearerAuth(user2Token))
        .send({ targetUserId: user1Id, venueId });

      const res = await request(app.getHttpServer())
        .get('/api/v1/interactions/liked-me')
        .set(bearerAuth(user1Token))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].user.id).toBe(user2Id);
    });

    it('should return 401 when no auth token is provided', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/interactions/liked-me')
        .expect(401);
    });
  });

  // ─── DELETE /api/v1/interactions/unlike/:targetUserId ──────────────────────

  describe('DELETE /api/v1/interactions/unlike/:targetUserId', () => {
    it('should successfully unlike a user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/interactions/like')
        .set(bearerAuth(user1Token))
        .send({ targetUserId: user2Id, venueId });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/interactions/unlike/${user2Id}`)
        .set(bearerAuth(user1Token))
        .expect(200);

      expect(res.body.success).toBe(true);

      // Verify the like is gone
      const checkRes = await request(app.getHttpServer())
        .get('/api/v1/interactions/my-likes')
        .set(bearerAuth(user1Token))
        .expect(200);

      expect(checkRes.body.data.length).toBe(0);
    });

    it('should return 401 when no auth token is provided', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/interactions/unlike/${user2Id}`)
        .expect(401);
    });

    it('should return 404 when the like does not exist', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/interactions/unlike/${user2Id}`)
        .set(bearerAuth(user1Token))
        .expect(404);

      expect(res.body.success).toBe(false);
    });

    it('should return 400 when user is not checked in to any venue', async () => {
      const freshUser = await registerTestUser(app);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/interactions/unlike/${user2Id}`)
        .set(bearerAuth(freshUser.accessToken))
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });
});
