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
  let redisService: RedisService;

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
    redisService = module.get<RedisService>(RedisService);

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
      expect(presenceService.handleHeartbeat).toHaveBeenCalledWith(
        mockClient,
        undefined,
      );
    });

    it('should forward optional coordinate payload', async () => {
      const payload = { latitude: 41.0, longitude: 28.0 };
      await presenceGateway.handleHeartbeat(mockClient, payload);
      expect(presenceService.handleHeartbeat).toHaveBeenCalledWith(
        mockClient,
        payload,
      );
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
    it('should emit match_found to both connected users', async () => {
      const mockUser1Socket = { emit: vi.fn() };
      const mockUser2Socket = { emit: vi.fn() };

      vi.spyOn(redisService, 'getUserSocket')
        .mockResolvedValueOnce('socket-1')
        .mockResolvedValueOnce('socket-2');

      mockServer.sockets.sockets.set('socket-1', mockUser1Socket);
      mockServer.sockets.sockets.set('socket-2', mockUser2Socket);

      const matchData = {
        chatSessionId: 'chat-1',
        venueId: 'v-1',
        venueName: 'Cool Place',
        expiresAt: new Date(),
        user1: { id: 'user-1', firstName: 'John', lastName: 'Doe' },
        user2: { id: 'user-2', firstName: 'Jane', lastName: 'Smith' },
      };

      await presenceGateway.notifyMatch('user-1', 'user-2', matchData);

      expect(mockUser1Socket.emit).toHaveBeenCalledWith(
        'match_found',
        expect.objectContaining({
          chatSessionId: 'chat-1',
          partner: matchData.user2,
        }),
      );

      expect(mockUser2Socket.emit).toHaveBeenCalledWith(
        'match_found',
        expect.objectContaining({
          chatSessionId: 'chat-1',
          partner: matchData.user1,
        }),
      );
    });

    it('should delete orphaned socket from redis if not found in server', async () => {
      // Redis says socket-1 exists
      vi.spyOn(redisService, 'getUserSocket').mockResolvedValue('socket-1');

      // But server map is empty!
      expect(mockServer.sockets.sockets.has('socket-1')).toBe(false);

      await presenceGateway.notifyMatch('user-1', 'user-2', {} as any);

      // It should clean up the orphan socket record
      expect(redisService.deleteUserSocket).toHaveBeenCalledWith('user-1');
    });
  });
});
