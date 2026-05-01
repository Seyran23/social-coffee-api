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

describe('Chat Gateway (WebSocket e2e)', () => {
  let app: INestApplication;

  let user1Token: string;
  let user1Id: string;
  let user2Token: string;
  let user2Id: string;
  let venueId: string;
  let chatSessionId: string;

  const openSockets: Socket[] = [];

  beforeAll(async () => {
    app = await getApp();
  });

  beforeEach(async () => {
    await clearAll();
    openSockets.length = 0;

    const venue = await prisma.venue.create({
      data: {
        name: 'WS Test Cafe',
        mapUrl: 'https://maps.google.com/?q=41.0,28.0',
        latitude: 41.0,
        longitude: 28.0,
        status: 'ACTIVE',
      },
    });
    venueId = venue.id;

    const reg1 = await registerTestUser(app);
    user1Token = reg1.accessToken;
    user1Id = reg1.user.id;

    const reg2 = await registerTestUser(app);
    user2Token = reg2.accessToken;
    user2Id = reg2.user.id;

    const coords = { latitude: 41.0, longitude: 28.0 };
    await request(app.getHttpServer())
      .post(`/api/v1/venues/${venueId}/checkin`)
      .set(bearerAuth(user1Token))
      .send(coords);
    await request(app.getHttpServer())
      .post(`/api/v1/venues/${venueId}/checkin`)
      .set(bearerAuth(user2Token))
      .send(coords);

    // Mutual like → ChatSession created in DB + cached in Redis
    await request(app.getHttpServer())
      .post('/api/v1/interactions/like')
      .set(bearerAuth(user2Token))
      .send({ targetUserId: user1Id, venueId });

    const matchRes = await request(app.getHttpServer())
      .post('/api/v1/interactions/like')
      .set(bearerAuth(user1Token))
      .send({ targetUserId: user2Id, venueId });

    chatSessionId = matchRes.body.data.chatSession.id;
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
      await expect(connectSocket(app, '/chat', '')).rejects.toThrow();
    });

    it('should reject connection with an invalid token', async () => {
      await expect(
        connectSocket(app, '/chat', 'totally.invalid.jwt'),
      ).rejects.toThrow();
    });

    it('should connect and receive chat_joined for the active session', async () => {
      const socket = await connectSocket(app, '/chat', user1Token);
      openSockets.push(socket);

      expect(socket.connected).toBe(true);

      // join_chat gives back the session and any existing messages
      const joinedPromise = waitForEvent<any>(socket, 'chat_joined');
      socket.emit('join_chat', { chatSessionId });
      const payload = await joinedPromise;

      expect(payload.chatSessionId).toBe(chatSessionId);
      expect(Array.isArray(payload.messages)).toBe(true);
      expect(payload.session.partner.id).toBe(user2Id);
    });

    it('should emit error when joining a non-existent session', async () => {
      const socket = await connectSocket(app, '/chat', user1Token);
      openSockets.push(socket);

      const errorPromise = waitForEvent<any>(socket, 'error');
      socket.emit('join_chat', { chatSessionId: 'nonexistent-id' });
      const err = await errorPromise;

      expect(err.message).toBeDefined();
    });
  });

  // ─── FULL CONVERSATION FLOW ───────────────────────────────────────────────
  //
  // Chat sessions are sequential state machines (join → message → type → end).
  // Testing the full flow in one test is more realistic than isolated steps
  // and avoids hitting the per-IP WebSocket connection rate limit (10/min).

  describe('real-time conversation', () => {
    it('should handle join, send_message, typing indicator, and end_chat', async () => {
      const [s1, s2] = await Promise.all([
        connectSocket(app, '/chat', user1Token),
        connectSocket(app, '/chat', user2Token),
      ]);
      openSockets.push(s1, s2);

      // ── join ──────────────────────────────────────────────────────────
      await Promise.all([
        (async () => {
          const p = waitForEvent(s1, 'chat_joined');
          s1.emit('join_chat', { chatSessionId });
          await p;
        })(),
        (async () => {
          const p = waitForEvent(s2, 'chat_joined');
          s2.emit('join_chat', { chatSessionId });
          await p;
        })(),
      ]);

      // ── send_message ──────────────────────────────────────────────────
      // server.to(room) broadcasts to all members including sender
      const [msgForS2, msgForS1] = await Promise.all([
        waitForEvent<any>(s2, 'message'),
        waitForEvent<any>(s1, 'message'),
        new Promise<void>(resolve => {
          s1.emit('send_message', {
            chatSessionId,
            content: 'Hello from user1!',
          });
          resolve();
        }),
      ]);

      expect(msgForS2.content).toBe('Hello from user1!');
      expect(msgForS2.senderId).toBe(user1Id);
      expect(msgForS2.chatSessionId).toBe(chatSessionId);
      // Sender also receives the broadcast
      expect(msgForS1.content).toBe('Hello from user1!');

      // ── typing indicator ──────────────────────────────────────────────
      const typingPromise = waitForEvent<any>(s2, 'partner_typing');
      s1.emit('typing', { chatSessionId, isTyping: true });
      const typing = await typingPromise;

      expect(typing.isTyping).toBe(true);
      expect(typing.userId).toBe(user1Id);

      // ── end_chat ──────────────────────────────────────────────────────
      const [ended1, ended2] = await Promise.all([
        waitForEvent<any>(s1, 'chat_ended'),
        waitForEvent<any>(s2, 'chat_ended'),
        new Promise<void>(resolve => {
          s1.emit('end_chat', { chatSessionId });
          resolve();
        }),
      ]);

      expect(ended1.chatSessionId).toBe(chatSessionId);
      expect(ended1.endedBy).toBe(user1Id);
      expect(ended2.chatSessionId).toBe(chatSessionId);
    });
  });
});
