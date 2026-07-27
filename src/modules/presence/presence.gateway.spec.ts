import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthenticatedSocket } from '@/common/interfaces/websocket/authenticated-socket.interface';
import { LoggerService } from '@/common/logger/logger.service';
import { WsAuthMiddleware } from '@/common/middleware/websocket-auth.middleware';
import { WsRateLimitMiddleware } from '@/common/middleware/websocket-rate-limit.middleware';
import { PresenceGateway } from '@/modules/presence/presence.gateway';
import { PresenceService } from '@/modules/presence/presence.service';
import { RedisService } from '@/modules/redis/redis.service';

describe('PresenceGateway', () => {
  let presenceGateway: PresenceGateway;
  let presenceService: PresenceService;

  let mockClient: AuthenticatedSocket;
  let mockServer: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.spyOn(global, 'setInterval').mockImplementation((() => {}) as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PresenceGateway,
        {
          provide: LoggerService,
          useValue: {
            log: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            setContext: vi.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            getUserSocket: vi.fn(),
            deleteUserSocket: vi.fn(),
          },
        },
        {
          provide: PresenceService,
          useValue: {
            handleUserConnection: vi.fn(),
            handleUserDisconnection: vi.fn(),
            handleHeartbeat: vi.fn(),
            broadcastUserJoined: vi.fn(),
            broadcastUserLeft: vi.fn(),
          },
        },
        {
          provide: WsAuthMiddleware,
          useValue: {
            use: vi.fn(),
          },
        },
        {
          provide: WsRateLimitMiddleware,
          useValue: {
            useConnectionLimit: vi.fn(),
            cleanup: vi.fn(),
          },
        },
      ],
    }).compile();

    presenceGateway = module.get<PresenceGateway>(PresenceGateway);
    presenceService = module.get<PresenceService>(PresenceService);

    // Mock Socket.io Server and Client
    mockServer = {
      use: vi.fn(),
      sockets: {
        sockets: new Map(),
      },
    };

    mockClient = {
      id: 'socket-123',
      user: { userId: 'user-1', email: 'test@test.com' },
      emit: vi.fn(),
      disconnect: vi.fn(),
    } as any;

    presenceGateway.server = mockServer as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('handleConnection', () => {
    it('should delegate connection to presenceService', async () => {
      await presenceGateway.handleConnection(mockClient);
      expect(presenceService.handleUserConnection).toHaveBeenCalledWith(
        mockClient,
      );
    });

    it('should emit error and disconnect if connection fails', async () => {
      vi.spyOn(presenceService, 'handleUserConnection').mockRejectedValue(
        new Error('Auth failed'),
      );

      await presenceGateway.handleConnection(mockClient);

      expect(mockClient.emit).toHaveBeenCalledWith('error', {
        message: 'Connection failed',
      });
      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('should delegate disconnection to presenceService', async () => {
      await presenceGateway.handleDisconnect(mockClient);
      expect(presenceService.handleUserDisconnection).toHaveBeenCalledWith(
        mockClient,
        expect.anything(),
      );
    });
  });

  describe('handleHeartbeat', () => {
    it('should delegate heartbeat to presenceService', async () => {
      await presenceGateway.handleHeartbeat(mockClient);
      expect(presenceService.handleHeartbeat).toHaveBeenCalledWith(mockClient);
    });
  });

  describe('broadcasts', () => {
    it('should broadcast user joined calling presenceService with server instance', async () => {
      await presenceGateway.broadcastUserJoined('user-1', 'venue-1');
      expect(presenceService.broadcastUserJoined).toHaveBeenCalledWith(
        'user-1',
        'venue-1',
        mockServer,
      );
    });

    it('should broadcast user left calling presenceService with server instance', async () => {
      await presenceGateway.broadcastUserLeft('user-1', 'venue-1');
      expect(presenceService.broadcastUserLeft).toHaveBeenCalledWith(
        'user-1',
        'venue-1',
        mockServer,
      );
    });
  });

  describe('notifyMatch', () => {
    it('emits match_found to both users’ personal rooms on the presence feed', () => {
      // `server.to(room)` returns an emitter; capture per-room emits.
      const emits: { room: string; event: string; payload: any }[] = [];
      mockServer.to = vi.fn((room: string) => ({
        emit: (event: string, payload: any) =>
          emits.push({ room, event, payload }),
      }));

      const matchData = {
        chatSessionId: 'chat-1',
        venueId: 'v-1',
        venueName: 'Cool Place',
        expiresAt: null,
        user1: { id: 'user-1', firstName: 'John', lastName: 'Doe' },
        user2: { id: 'user-2', firstName: 'Jane', lastName: 'Smith' },
      };

      presenceGateway.notifyMatch('user-1', 'user-2', matchData);

      const toUser1 = emits.find(e => e.room === 'user:user-1');
      const toUser2 = emits.find(e => e.room === 'user:user-2');

      expect(toUser1?.event).toBe('match_found');
      expect(toUser1?.payload).toMatchObject({
        chatSessionId: 'chat-1',
        message: 'You have a match!',
        partner: matchData.user2,
      });

      expect(toUser2?.event).toBe('match_found');
      expect(toUser2?.payload).toMatchObject({
        chatSessionId: 'chat-1',
        message: 'You have a match!',
        partner: matchData.user1,
      });
    });
  });
});
