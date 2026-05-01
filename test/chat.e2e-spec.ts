import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { bearerAuth, registerTestUser } from './helpers/auth.helper';
import { clearAll, disconnectDb, prisma } from './helpers/db.helper';
import { closeApp, getApp } from './helpers/test-app.helper';

describe('Chat (e2e)', () => {
  let app: INestApplication;
  let user1Token: string;
  let user1Id: string;
  let user2Id: string;
  let user2Token: string;
  let venueId: string;

  beforeAll(async () => {
    app = await getApp();
  });

  beforeEach(async () => {
    await clearAll();

    const venue = await prisma.venue.create({
      data: {
        name: 'Chat Cafe',
        mapUrl: 'https://maps.google.com/?q=41.0,28.0',
        latitude: 41.0,
        longitude: 28.0,
        status: 'ACTIVE',
      },
    });
    venueId = venue.id;

    const user1 = await registerTestUser(app);
    user1Token = user1.accessToken;
    user1Id = user1.user.id;

    const user2 = await registerTestUser(app);
    user2Id = user2.user.id;
    user2Token = user2.accessToken;
  });

  afterAll(async () => {
    await clearAll();
    await disconnectDb();
    await closeApp();
  });

  describe('GET /api/v1/chat/sessions', () => {
    it('should return empty list when no sessions exist', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/chat/sessions')
        .set(bearerAuth(user1Token))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(0);
    });

    it('should return chat sessions when matched', async () => {
      // Create chat session manually via prisma
      await prisma.chatSession.create({
        data: {
          venueId,
          user1Id,
          user2Id,
          status: 'ACTIVE',
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 mins
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/chat/sessions')
        .set(bearerAuth(user1Token))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].partner.id).toBe(user2Id);
      expect(res.body.data[0].venue.id).toBe(venueId);
    });

    it('should return 401 when not authenticated', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/chat/sessions')
        .expect(401);
    });

    it('should return sessions filtered by venueId', async () => {
      await prisma.chatSession.create({
        data: {
          venueId,
          user1Id,
          user2Id,
          status: 'ACTIVE',
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/chat/sessions?venueId=${venueId}`)
        .set(bearerAuth(user1Token))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].venue.id).toBe(venueId);
    });

    it('should return empty list when filtering by a different venueId', async () => {
      await prisma.chatSession.create({
        data: {
          venueId,
          user1Id,
          user2Id,
          status: 'ACTIVE',
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });

      const otherVenue = await prisma.venue.create({
        data: {
          name: 'Other Cafe',
          mapUrl: 'https://maps.google.com/?q=40.0,27.0',
          latitude: 40.0,
          longitude: 27.0,
          status: 'ACTIVE',
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/chat/sessions?venueId=${otherVenue.id}`)
        .set(bearerAuth(user1Token))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(0);
    });

    it('should return sessions where the current user is user2 with correct partner', async () => {
      await prisma.chatSession.create({
        data: {
          venueId,
          user1Id,
          user2Id,
          status: 'ACTIVE',
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/chat/sessions')
        .set(bearerAuth(user2Token))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].partner.id).toBe(user1Id);
    });
  });
});
