import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  bearerAuth,
  loginTestUser,
  registerTestUser,
} from './helpers/auth.helper';
import { clearAll, disconnectDb, prisma } from './helpers/db.helper';
import { closeApp, getApp } from './helpers/test-app.helper';

describe('Venue (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;
  let venueId: string;

  // A real Google Maps URL that extracts valid coordinates
  const createVenueDto = {
    name: 'Test Coffee House',
    mapUrl: 'https://maps.google.com/?q=41.0082376,28.9783589',
    geofenceMeters: 200,
    status: 'ACTIVE',
  };

  beforeAll(async () => {
    app = await getApp();
  });

  beforeEach(async () => {
    await clearAll();

    // Create an admin user directly via Prisma (bypass the API since no admin register endpoint)
    const bcrypt = await import('bcrypt');
    const hashedPassword = await bcrypt.hash('Admin123!', 10);
    const admin = await prisma.user.create({
      data: {
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@test.com',
        passwordHash: hashedPassword,
        birthDate: new Date('1990-01-01'),
        gender: 'MALE',
        bio: 'Admin account.',
        role: 'ADMIN',
      },
    });

    const adminLogin = await loginTestUser(app, admin.email, 'Admin123!');
    adminToken = adminLogin.accessToken;

    // Create a regular user
    const user = await registerTestUser(app, { email: 'user@test.com' });
    userToken = user.accessToken;

    // Pre-create a venue directly via Prisma to avoid the Google Maps HTTP
    // fetch that happens inside the venue service's createVenue method.
    const venue = await prisma.venue.create({
      data: {
        name: 'Test Coffee House',
        mapUrl: 'https://maps.google.com/?q=41.0082376,28.9783589',
        latitude: 41.0082376,
        longitude: 28.9783589,
        geofenceMeters: 200,
        status: 'ACTIVE',
      },
    });
    venueId = venue.id;
  });

  afterAll(async () => {
    await clearAll();
    await disconnectDb();
    await closeApp();
  });

  // ─── GET ALL VENUES (ADMIN) ───────────────────────────────────────────────

  describe('GET /api/v1/venues (admin only)', () => {
    it('should return paginated venues for admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/venues')
        .set(bearerAuth(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return 403 for regular users', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/venues')
        .set(bearerAuth(userToken))
        .expect(403);
    });
  });

  // ─── GET VENUE BY ID ──────────────────────────────────────────────────────

  describe('GET /api/v1/venues/:id', () => {
    it('should return venue with qr code', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/venues/${venueId}`)
        .set(bearerAuth(userToken))
        .expect(200);

      expect(res.body.data.id).toBe(venueId);
      expect(res.body.data.name).toBe('Test Coffee House');
      expect(res.body.data.qrCode).toBeDefined();
    });

    it('should return 404 for unknown venue id', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/venues/nonexistent-id-xyz')
        .set(bearerAuth(userToken))
        .expect(404);
    });
  });

  // ─── CREATE VENUE (ADMIN) ─────────────────────────────────────────────────

  describe('POST /api/v1/venues (admin only)', () => {
    it('should create a new venue', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/venues')
        .set(bearerAuth(adminToken))
        .send({ ...createVenueDto, name: 'Another Cafe' })
        .expect(201);

      expect(res.body.data.name).toBe('Another Cafe');
      expect(res.body.data.id).toBeDefined();
    });

    it('should return 403 for regular users', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/venues')
        .set(bearerAuth(userToken))
        .send(createVenueDto)
        .expect(403);
    });
  });

  // ─── UPDATE VENUE (ADMIN) ─────────────────────────────────────────────────

  describe('PATCH /api/v1/venues/:id (admin only)', () => {
    it('should update venue name', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/venues/${venueId}`)
        .set(bearerAuth(adminToken))
        .send({ name: 'Updated Coffee House' })
        .expect(200);

      expect(res.body.data.name).toBe('Updated Coffee House');
    });
  });

  // ─── CHANGE STATUS (ADMIN) ────────────────────────────────────────────────

  describe('PATCH /api/v1/venues/:id/status (admin only)', () => {
    it('should change venue status to TEMPORARILY_CLOSED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/venues/${venueId}/status`)
        .set(bearerAuth(adminToken))
        .send({ status: 'TEMPORARILY_CLOSED' })
        .expect(200);

      expect(res.body.data.status).toBe('TEMPORARILY_CLOSED');
    });
  });

  // ─── CHECK-IN ─────────────────────────────────────────────────────────────

  describe('POST /api/v1/venues/:id/checkin', () => {
    it('should return 400 when outside geofence', async () => {
      // Coordinates far from the venue (Istanbul → New York)
      const res = await request(app.getHttpServer())
        .post(`/api/v1/venues/${venueId}/checkin`)
        .set(bearerAuth(userToken))
        .send({ latitude: 40.7128, longitude: -74.006 })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should check in successfully when within geofence', async () => {
      // Same coordinates as the venue (Istanbul)
      const res = await request(app.getHttpServer())
        .post(`/api/v1/venues/${venueId}/checkin`)
        .set(bearerAuth(userToken))
        .send({ latitude: 41.0082376, longitude: 28.9783589 })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ─── DELETE VENUE (ADMIN) ─────────────────────────────────────────────────

  describe('DELETE /api/v1/venues/:id (admin only)', () => {
    it('should soft-delete venue and set status to PERMANENTLY_CLOSED', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/venues/${venueId}`)
        .set(bearerAuth(adminToken))
        .expect(200);

      expect(res.body.data.status).toBe('PERMANENTLY_CLOSED');
    });

    it('should return 403 for regular users', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/venues/${venueId}`)
        .set(bearerAuth(userToken))
        .expect(403);
    });
  });

  // ─── CHECK-OUT ────────────────────────────────────────────────────────────

  describe('POST /api/v1/venues/:id/checkout', () => {
    it('should check out successfully after checking in', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/venues/${venueId}/checkin`)
        .set(bearerAuth(userToken))
        .send({ latitude: 41.0082376, longitude: 28.9783589 })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/venues/${venueId}/checkout`)
        .set(bearerAuth(userToken))
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('should return 400 when user is not checked in to the venue', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/venues/${venueId}/checkout`)
        .set(bearerAuth(userToken))
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/venues/${venueId}/checkout`)
        .expect(401);
    });
  });

  // ─── GET VENUE QR CODE (ADMIN) ────────────────────────────────────────────

  describe('GET /api/v1/venues/:id/qrcode (admin only)', () => {
    it('should return QR code for admin', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/venues/${venueId}/qrcode`)
        .set(bearerAuth(adminToken))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.qrCode).toBeDefined();
      expect(res.body.data.qrCode).toMatch(/^data:image/);
      expect(res.body.data.venueId).toBe(venueId);
    });

    it('should return 403 for regular users', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/venues/${venueId}/qrcode`)
        .set(bearerAuth(userToken))
        .expect(403);
    });
  });
});
