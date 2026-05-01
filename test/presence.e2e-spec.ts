import { INestApplication } from '@nestjs/common';
import { Socket } from 'socket.io-client';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { bearerAuth, registerTestUser } from './helpers/auth.helper';
import { clearAll, disconnectDb, prisma } from './helpers/db.helper';
import { closeApp, getApp } from './helpers/test-app.helper';
import {
  connectSocket,
  disconnectSocket,
  waitForEvent,
} from './helpers/ws.helper';

describe('Presence Gateway (WebSocket e2e)', () => {
  let app: INestApplication;

  let user1Token: string;
  let user2Token: string;
  let venueId: string;

  const openSockets: Socket[] = [];

  beforeAll(async () => {
    app = await getApp();
  });

  beforeEach(async () => {
    await clearAll();
    openSockets.length = 0;

    const venue = await prisma.venue.create({
      data: {
        name: 'Presence Test Cafe',
        mapUrl: 'https://maps.google.com/?q=41.0,28.0',
        latitude: 41.0,
        longitude: 28.0,
        status: 'ACTIVE',
      },
    });
    venueId = venue.id;

    const reg1 = await registerTestUser(app);
    user1Token = reg1.accessToken;

    const reg2 = await registerTestUser(app);
    user2Token = reg2.accessToken;
  });

  afterEach(() => {
    for (const s of openSockets) {
      disconnectSocket(s);
    }
  });

  afterAll(async () => {
    await clearAll();
    await disconnectDb();
    await closeApp();
  });

  // ─── CONNECTION ───────────────────────────────────────────────────────────

  describe('connection', () => {
    it('should reject connection without a token', async () => {
      await expect(connectSocket(app, '/presence', '')).rejects.toThrow();
    });

    it('should reject connection with an invalid token', async () => {
      await expect(
        connectSocket(app, '/presence', 'bad.token.value'),
      ).rejects.toThrow();
    });

    it('should disconnect with error event when user is not checked in', async () => {
      // user1 is registered but not checked in → verifyUserCheckIn emits error + disconnects
      const socket = await connectSocket(app, '/presence', user1Token);
      openSockets.push(socket);

      // The gateway emits 'error' then disconnects; wait for either
      const errorPayload = await waitForEvent<any>(socket, 'error', 3000).catch(
        () => null,
      );
      // Whether we caught error or the socket just disconnected, it should no longer be connected
      // Give it a moment to process
      await new Promise(r => setTimeout(r, 200));

      // Either the error was delivered OR the socket was cleanly disconnected
      expect(errorPayload?.message ?? socket.disconnected).toBeTruthy();
    });

    it('should connect and receive feed_initial when checked in', async () => {
      // Check user1 into the venue first (creates Redis presence state)
      await request(app.getHttpServer())
        .post(`/api/v1/venues/${venueId}/checkin`)
        .set(bearerAuth(user1Token))
        .send({ latitude: 41.0, longitude: 28.0 });

      const socket = await connectSocket(app, '/presence', user1Token);
      openSockets.push(socket);

      const feed = await waitForEvent<any>(socket, 'feed_initial');

      expect(feed.timestamp).toBeDefined();
      // feed.users is the result of discoverProfiles (paginated object)
      expect(feed.users).toBeDefined();
    });
  });

  // ─── HEARTBEAT ────────────────────────────────────────────────────────────

  describe('heartbeat', () => {
    it('should respond with heartbeat_ack containing a timestamp', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/venues/${venueId}/checkin`)
        .set(bearerAuth(user1Token))
        .send({ latitude: 41.0, longitude: 28.0 });

      const socket = await connectSocket(app, '/presence', user1Token);
      openSockets.push(socket);

      // Wait for the initial feed before sending heartbeat
      await waitForEvent(socket, 'feed_initial');

      const ackPromise = waitForEvent<any>(socket, 'heartbeat_ack');
      socket.emit('heartbeat');
      const ack = await ackPromise;

      expect(typeof ack.timestamp).toBe('number');
      expect(ack.timestamp).toBeGreaterThan(0);
    });
  });

  // ─── USER JOINED ──────────────────────────────────────────────────────────

  describe('user_joined', () => {
    it('should notify existing venue users when a new user connects', async () => {
      // Check both users in
      const coords = { latitude: 41.0, longitude: 28.0 };
      await request(app.getHttpServer())
        .post(`/api/v1/venues/${venueId}/checkin`)
        .set(bearerAuth(user1Token))
        .send(coords);
      await request(app.getHttpServer())
        .post(`/api/v1/venues/${venueId}/checkin`)
        .set(bearerAuth(user2Token))
        .send(coords);

      // User1 connects first and waits in the venue room
      const s1 = await connectSocket(app, '/presence', user1Token);
      openSockets.push(s1);
      await waitForEvent(s1, 'feed_initial');

      // Set up listener before user2 connects
      const joinedPromise = waitForEvent<any>(s1, 'user_joined');

      // User2 connects → gateway broadcasts user_joined to the venue room
      const s2 = await connectSocket(app, '/presence', user2Token);
      openSockets.push(s2);

      const payload = await joinedPromise;

      expect(payload.user).toBeDefined();
      expect(payload.timestamp).toBeDefined();
    });
  });
});
