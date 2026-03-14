import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthenticatedSocket } from '@/common/interfaces/websocket/authenticated-socket.interface';
import { LoggerService } from '@/common/logger/logger.service';
import { WsAuthMiddleware } from '@/common/middleware/websocket-auth.middleware';
import { WsRateLimitMiddleware } from '@/common/middleware/websocket-rate-limit.middleware';
import { ChatGateway } from '@/modules/chat/chat.gateway';
import { ChatService } from '@/modules/chat/chat.service';
import { CHAT_EVENTS } from '@/modules/chat/constants/events';
import { RedisService } from '@/modules/redis/redis.service';

describe('ChatGateway', () => {
  let chatGateway: ChatGateway;
  let chatService: ChatService;
  let redisService: RedisService;
  let wsRateLimitMiddleware: WsRateLimitMiddleware;

  let mockClient: AuthenticatedSocket;
  let mockServer: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.spyOn(global, 'setInterval').mockImplementation((() => {}) as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
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
            setUserSocket: vi.fn(),
            deleteUserSocket: vi.fn(),
            getUserActiveChatSession: vi.fn(),
            getUserSocket: vi.fn(),
          },
        },
        {
          provide: ChatService,
          useValue: {
            validateParticipant: vi.fn(),
            getMessages: vi.fn(),
            getChatSession: vi.fn(),
            sendMessage: vi.fn(),
            endChat: vi.fn(),
            getPartnerId: vi.fn(),
            checkExpiringChats: vi.fn(),
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
            checkEventRateLimit: vi.fn().mockResolvedValue(true), // Allow by default
          },
        },
      ],
    }).compile();

    chatGateway = module.get<ChatGateway>(ChatGateway);
    chatService = module.get<ChatService>(ChatService);
    redisService = module.get<RedisService>(RedisService);
    wsRateLimitMiddleware = module.get<WsRateLimitMiddleware>(
      WsRateLimitMiddleware,
    );

    // Mock Socket.io Server and Client
    mockServer = {
      use: vi.fn(),
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
      sockets: {
        sockets: new Map(),
      },
    };

    mockClient = {
      id: 'socket-123',
      user: { userId: 'user-1', email: 'test@test.com' },
      emit: vi.fn(),
      join: vi.fn(),
      to: vi.fn().mockReturnThis(),
    } as any;

    chatGateway.server = mockServer as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('handleConnection', () => {
    it('should register socket in Redis and emit success if no auto-join', async () => {
      vi.spyOn(redisService, 'getUserActiveChatSession').mockResolvedValue(
        null,
      );

      await chatGateway.handleConnection(mockClient);

      expect(redisService.setUserSocket).toHaveBeenCalledWith(
        'user-1',
        'socket-123',
      );
      expect(mockClient.emit).toHaveBeenCalledWith(
        CHAT_EVENTS.CHAT_JOINED,
        expect.objectContaining({
          message: 'Connected to chat service',
        }),
      );
    });

    it('should auto-join existing chat on connection if active session exists', async () => {
      vi.spyOn(redisService, 'getUserActiveChatSession').mockResolvedValue(
        'chat-1',
      );
      vi.spyOn(chatService, 'getMessages').mockResolvedValue([]);
      vi.spyOn(chatService, 'getChatSession').mockResolvedValue({} as any);

      await chatGateway.handleConnection(mockClient);

      expect(mockClient.join).toHaveBeenCalledWith('chat:chat-1');
      expect(mockClient.emit).toHaveBeenCalledWith(
        CHAT_EVENTS.CHAT_JOINED,
        expect.objectContaining({
          chatSessionId: 'chat-1',
          reconnected: true,
        }),
      );
    });
  });

  describe('handleJoinChat', () => {
    it('should join the correct room and emit messages', async () => {
      vi.spyOn(chatService, 'validateParticipant').mockResolvedValue(undefined);
      vi.spyOn(chatService, 'getMessages').mockResolvedValue([
        { id: 'msg-1' },
      ] as any);
      vi.spyOn(chatService, 'getChatSession').mockResolvedValue({
        id: 'chat-1',
      } as any);

      await chatGateway.handleJoinChat(mockClient, { chatSessionId: 'chat-1' });

      expect(chatService.validateParticipant).toHaveBeenCalledWith(
        'chat-1',
        'user-1',
      );
      expect(mockClient.join).toHaveBeenCalledWith('chat:chat-1');
      expect(mockClient.emit).toHaveBeenCalledWith(
        CHAT_EVENTS.CHAT_JOINED,
        expect.objectContaining({
          chatSessionId: 'chat-1',
          messages: [{ id: 'msg-1' }],
        }),
      );
    });

    it('should emit error if user is not participant', async () => {
      vi.spyOn(chatService, 'validateParticipant').mockRejectedValue(
        new Error('Not found'),
      );

      await chatGateway.handleJoinChat(mockClient, { chatSessionId: 'chat-1' });

      expect(mockClient.emit).toHaveBeenCalledWith(CHAT_EVENTS.ERROR, {
        message: 'Not found',
      });
    });
  });

  describe('handleSendMessage', () => {
    it('should not send message if rate limit exceeded', async () => {
      vi.spyOn(wsRateLimitMiddleware, 'checkEventRateLimit').mockResolvedValue(
        false,
      );

      await chatGateway.handleSendMessage(mockClient, {
        chatSessionId: 'chat-1',
        content: 'hello',
      });

      expect(chatService.sendMessage).not.toHaveBeenCalled();
      expect(mockClient.emit).toHaveBeenCalledWith(CHAT_EVENTS.ERROR, {
        message: 'Rate limit exceeded. Please slow down!',
      });
    });

    it('should broadcast message to chat room on success', async () => {
      vi.spyOn(chatService, 'sendMessage').mockResolvedValue({
        id: 'msg-1',
        chatSessionId: 'chat-1',
        senderId: 'user-1',
        content: 'hello',
        createdAt: new Date(),
      } as any);

      await chatGateway.handleSendMessage(mockClient, {
        chatSessionId: 'chat-1',
        content: 'hello',
      });

      expect(chatService.sendMessage).toHaveBeenCalledWith({
        chatSessionId: 'chat-1',
        senderId: 'user-1',
        content: 'hello',
      });
      // Verifies server.to('chat:chat-1').emit(...)
      expect(mockServer.to).toHaveBeenCalledWith('chat:chat-1');
      expect(mockServer.emit).toHaveBeenCalledWith(
        CHAT_EVENTS.MESSAGE,
        expect.objectContaining({
          id: 'msg-1',
          content: 'hello',
        }),
      );
    });
  });

  describe('handleTyping', () => {
    it('should broadcast typing status to partner', async () => {
      vi.spyOn(chatService, 'validateParticipant').mockResolvedValue();

      await chatGateway.handleTyping(mockClient, {
        chatSessionId: 'chat-1',
        isTyping: true,
      });

      expect(mockClient.to).toHaveBeenCalledWith('chat:chat-1');
      expect(mockClient.emit).toHaveBeenCalledWith(CHAT_EVENTS.PARTNER_TYPING, {
        userId: 'user-1',
        isTyping: true,
      });
    });
  });

  describe('handleEndChat', () => {
    it('should call chatService.endChat and broadcast termination', async () => {
      vi.spyOn(chatService, 'endChat').mockResolvedValue();

      await chatGateway.handleEndChat(mockClient, { chatSessionId: 'chat-1' });

      expect(chatService.endChat).toHaveBeenCalledWith('chat-1', 'user-1');
      expect(mockServer.to).toHaveBeenCalledWith('chat:chat-1');
      expect(mockServer.emit).toHaveBeenCalledWith(
        CHAT_EVENTS.CHAT_ENDED,
        expect.objectContaining({
          chatSessionId: 'chat-1',
          endedBy: 'user-1',
        }),
      );
    });
  });

  describe('notifyMatch', () => {
    it('should emit match event to both successfully connected sockets', async () => {
      const mockUser1Socket = { emit: vi.fn() };
      const mockUser2Socket = { emit: vi.fn() };

      // Make redis return mock socket IDs
      vi.spyOn(redisService, 'getUserSocket')
        .mockResolvedValueOnce('socket-1')
        .mockResolvedValueOnce('socket-2');

      // Add sockets to mockServer Map
      mockServer.sockets.sockets.set('socket-1', mockUser1Socket);
      mockServer.sockets.sockets.set('socket-2', mockUser2Socket);

      const matchData = {
        chatSessionId: 'chat-1',
        venueId: 'v-1',
        venueName: 'Place',
        expiresAt: new Date(),
        user1: { id: 'user-1', firstName: 'John', lastName: 'Doe' },
        user2: { id: 'user-2', firstName: 'Jane', lastName: 'Smith' },
      };

      await chatGateway.notifyMatch('user-1', 'user-2', matchData);

      expect(mockUser1Socket.emit).toHaveBeenCalledWith(
        CHAT_EVENTS.MATCH_FOUND,
        expect.objectContaining({
          partner: matchData.user2,
        }),
      );
      expect(mockUser2Socket.emit).toHaveBeenCalledWith(
        CHAT_EVENTS.MATCH_FOUND,
        expect.objectContaining({
          partner: matchData.user1,
        }),
      );
    });
  });
});
