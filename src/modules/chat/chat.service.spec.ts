import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ChatSessionStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { ChatService } from '@/modules/chat/chat.service';
import {
  DEFAULT_MESSAGE_LIMIT,
  MAX_MESSAGE_LIMIT,
} from '@/modules/chat/constants/default-message-limit';
import { CHAT_MESSAGES } from '@/modules/chat/constants/messages';
import { RedisService } from '@/modules/redis/redis.service';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const makeSession = (overrides: Record<string, unknown> = {}) => ({
  id: 'chat-1',
  status: ChatSessionStatus.ACTIVE,
  user1Id: 'user-1',
  user2Id: 'user-2',
  venueId: 'venue-1',
  startedAt: new Date('2024-01-01T10:00:00Z'),
  expiresAt: new Date('2024-01-01T11:00:00Z'),
  user1: { id: 'user-1', firstName: 'Alice', lastName: 'Smith' },
  user2: { id: 'user-2', firstName: 'Bob', lastName: 'Jones' },
  venue: { id: 'venue-1', name: 'Brew Lab' },
  ...overrides,
});

const makeCachedSession = (overrides: Record<string, unknown> = {}) => ({
  id: 'chat-1',
  user1Id: 'user-1',
  user2Id: 'user-2',
  venueId: 'venue-1',
  status: ChatSessionStatus.ACTIVE,
  startedAt: new Date('2024-01-01T10:00:00Z').getTime(),
  expiresAt: new Date('2024-01-01T11:00:00Z').getTime(),
  user1: { id: 'user-1', firstName: 'Alice', lastName: 'Smith' },
  user2: { id: 'user-2', firstName: 'Bob', lastName: 'Jones' },
  venue: { id: 'venue-1', name: 'Brew Lab' },
  ...overrides,
});

// ---------------------------------------------------------------------------

describe('ChatService', () => {
  let chatService: ChatService;
  let prismaService: PrismaService;
  let redisService: RedisService;

  beforeEach(async () => {
    // Prevent the setInterval from running indefinitely during tests
    vi.useFakeTimers();
    vi.spyOn(global, 'setInterval').mockImplementation((() => {}) as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: PrismaService,
          useValue: {
            chatSession: {
              findUnique: vi.fn(),
              findFirst: vi.fn(),
              findMany: vi.fn(),
              update: vi.fn(),
            },
            message: {
              create: vi.fn(),
              findMany: vi.fn(),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            getChatSession: vi.fn(),
            setChatSession: vi.fn(),
            deleteChatSession: vi.fn(),
            cacheMessage: vi.fn(),
            getCachedMessages: vi.fn(),
          },
        },
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
      ],
    }).compile();

    chatService = module.get<ChatService>(ChatService);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // =========================================================================
  // sendMessage
  // =========================================================================

  describe('sendMessage', () => {
    const chatSessionId = 'chat-1';
    const senderId = 'user-1';
    const content = 'Hello world!';
    const sendMessagePayload = { chatSessionId, senderId, content };

    it('should throw ForbiddenException if user is not a participant', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue(null);
      vi.spyOn(prismaService.chatSession, 'findFirst').mockResolvedValue(null);

      await expect(chatService.sendMessage(sendMessagePayload)).rejects.toThrow(
        new ForbiddenException(CHAT_MESSAGES.NOT_PARTICIPANT),
      );
    });

    it('should throw BadRequestException if chat is already ended', async () => {
      // Mock validateParticipant
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
        user2Id: 'user-2',
      } as any);

      vi.spyOn(prismaService.chatSession, 'findUnique').mockResolvedValue({
        id: chatSessionId,
        status: ChatSessionStatus.ENDED, // Chat ended
      } as any);

      await expect(chatService.sendMessage(sendMessagePayload)).rejects.toThrow(
        new BadRequestException(CHAT_MESSAGES.CHAT_ALREADY_ENDED),
      );
    });

    it('should throw BadRequestException if chat is expired', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
      } as any);

      vi.spyOn(prismaService.chatSession, 'findUnique').mockResolvedValue({
        id: chatSessionId,
        status: ChatSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() - 10000), // Expired 10 seconds ago
      } as any);

      await expect(chatService.sendMessage(sendMessagePayload)).rejects.toThrow(
        new BadRequestException(CHAT_MESSAGES.CHAT_EXPIRED),
      );
    });

    it('should create message in DB and cache it if chat is active and valid', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
      } as any);

      vi.spyOn(prismaService.chatSession, 'findUnique').mockResolvedValue({
        id: chatSessionId,
        status: ChatSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 600000), // Expires in 10 mins
      } as any);

      const mockCreatedMessage = {
        id: 'msg-1',
        chatSessionId,
        senderId,
        content,
        createdAt: new Date(),
      };

      vi.spyOn(prismaService.message, 'create').mockResolvedValue(
        mockCreatedMessage as any,
      );

      const result = await chatService.sendMessage(sendMessagePayload);

      expect(prismaService.message.create).toHaveBeenCalledWith({
        data: { chatSessionId, senderId, content },
      });
      expect(redisService.cacheMessage).toHaveBeenCalledWith(chatSessionId, {
        id: 'msg-1',
        senderId,
        content,
        timestamp: mockCreatedMessage.createdAt.getTime(),
      });
      expect(result).toEqual(mockCreatedMessage);
    });

    it('should throw NotFoundException if session disappears after validateParticipant', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
      } as any);

      vi.spyOn(prismaService.chatSession, 'findUnique').mockResolvedValue(null);

      await expect(chatService.sendMessage(sendMessagePayload)).rejects.toThrow(
        new NotFoundException(CHAT_MESSAGES.CHAT_NOT_FOUND),
      );
    });

    it('should throw BadRequestException when sanitized content is empty', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
      } as any);

      vi.spyOn(prismaService.chatSession, 'findUnique').mockResolvedValue({
        id: chatSessionId,
        status: ChatSessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 600000),
      } as any);

      // Content that reduces to empty after sanitization (only HTML tags/whitespace)
      await expect(
        chatService.sendMessage({ chatSessionId, senderId, content: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // getMessages
  // =========================================================================

  describe('getMessages', () => {
    it('should return cached messages first if available', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
      } as any);

      const mockCachedMessages = [
        {
          id: 'msg-1',
          senderId: 'user-1',
          content: 'Hi',
          timestamp: Date.now(),
        },
      ];
      vi.spyOn(redisService, 'getCachedMessages').mockResolvedValue(
        mockCachedMessages as any,
      );

      const result = await chatService.getMessages('chat-1', 'user-1');

      expect(redisService.getCachedMessages).toHaveBeenCalled();
      expect(prismaService.message.findMany).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('msg-1');
    });

    it('should fetch from database if cache is empty', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
      } as any);

      vi.spyOn(redisService, 'getCachedMessages').mockResolvedValue([]);

      const mockDbMessages = [
        {
          id: 'msg-1',
          senderId: 'user-2',
          content: 'Hello',
          createdAt: new Date(),
        },
      ];
      vi.spyOn(prismaService.message, 'findMany').mockResolvedValue(
        mockDbMessages as any,
      );

      const result = await chatService.getMessages('chat-1', 'user-1');

      expect(prismaService.message.findMany).toHaveBeenCalled();
      // Service reverses the order of db messages (desc -> asc for chat UI)
      expect(result).toHaveLength(1);
    });

    it('should skip cache and go straight to DB when "before" cursor is provided', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
      } as any);

      const beforeDate = new Date('2024-01-01T10:30:00Z');
      const mockDbMessages = [
        {
          id: 'msg-2',
          senderId: 'user-2',
          content: 'Earlier msg',
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
      ];
      vi.spyOn(prismaService.message, 'findMany').mockResolvedValue(
        mockDbMessages as any,
      );

      const result = await chatService.getMessages('chat-1', 'user-1', {
        before: beforeDate,
      });

      expect(redisService.getCachedMessages).not.toHaveBeenCalled();
      expect(prismaService.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ createdAt: { lt: beforeDate } }),
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('should cap limit at MAX_MESSAGE_LIMIT when limit exceeds maximum', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
      } as any);

      vi.spyOn(redisService, 'getCachedMessages').mockResolvedValue([]);
      vi.spyOn(prismaService.message, 'findMany').mockResolvedValue([]);

      await chatService.getMessages('chat-1', 'user-1', {
        limit: MAX_MESSAGE_LIMIT + 500,
      });

      expect(redisService.getCachedMessages).toHaveBeenCalledWith(
        'chat-1',
        MAX_MESSAGE_LIMIT,
      );
    });

    it('should use DEFAULT_MESSAGE_LIMIT when no limit option is provided', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
      } as any);

      vi.spyOn(redisService, 'getCachedMessages').mockResolvedValue([]);
      vi.spyOn(prismaService.message, 'findMany').mockResolvedValue([]);

      await chatService.getMessages('chat-1', 'user-1');

      expect(redisService.getCachedMessages).toHaveBeenCalledWith(
        'chat-1',
        DEFAULT_MESSAGE_LIMIT,
      );
    });

    it('should return empty array when DB also has no messages', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
      } as any);

      vi.spyOn(redisService, 'getCachedMessages').mockResolvedValue([]);
      vi.spyOn(prismaService.message, 'findMany').mockResolvedValue([]);

      const result = await chatService.getMessages('chat-1', 'user-1');

      expect(result).toEqual([]);
    });

    it('should fall back to DB when Redis getCachedMessages throws', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
      } as any);

      vi.spyOn(redisService, 'getCachedMessages').mockRejectedValue(
        new Error('Redis connection lost'),
      );

      const mockDbMessages = [
        {
          id: 'msg-1',
          senderId: 'user-2',
          content: 'Hello',
          createdAt: new Date(),
        },
      ];
      vi.spyOn(prismaService.message, 'findMany').mockResolvedValue(
        mockDbMessages as any,
      );

      const result = await chatService.getMessages('chat-1', 'user-1');

      expect(prismaService.message.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  // =========================================================================
  // endChat
  // =========================================================================

  describe('endChat', () => {
    it('should throw NotFound if chat does not exist', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
      } as any);

      vi.spyOn(prismaService.chatSession, 'findUnique').mockResolvedValue(null);

      await expect(chatService.endChat('chat-1', 'user-1')).rejects.toThrow(
        new NotFoundException(CHAT_MESSAGES.CHAT_NOT_FOUND),
      );
    });

    it('should update status to ENDED and delete from Redis if active', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
      } as any);

      vi.spyOn(prismaService.chatSession, 'findUnique').mockResolvedValue({
        id: 'chat-1',
        status: ChatSessionStatus.ACTIVE,
        user1Id: 'user-1',
        user2Id: 'user-2',
      } as any);

      await chatService.endChat('chat-1', 'user-1');

      expect(prismaService.chatSession.update).toHaveBeenCalledWith({
        where: { id: 'chat-1' },
        data: { status: ChatSessionStatus.ENDED },
      });
      expect(redisService.deleteChatSession).toHaveBeenCalledWith(
        'chat-1',
        'user-1',
        'user-2',
      );
    });

    it('should throw BadRequestException if chat is already ended', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
      } as any);

      vi.spyOn(prismaService.chatSession, 'findUnique').mockResolvedValue({
        id: 'chat-1',
        status: ChatSessionStatus.ENDED,
        user1Id: 'user-1',
        user2Id: 'user-2',
      } as any);

      await expect(chatService.endChat('chat-1', 'user-1')).rejects.toThrow(
        new BadRequestException(CHAT_MESSAGES.CHAT_ALREADY_ENDED),
      );
    });

    it('should throw BadRequestException if chat status is EXPIRED', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
      } as any);

      vi.spyOn(prismaService.chatSession, 'findUnique').mockResolvedValue({
        id: 'chat-1',
        status: ChatSessionStatus.EXPIRED,
        user1Id: 'user-1',
        user2Id: 'user-2',
      } as any);

      await expect(chatService.endChat('chat-1', 'user-1')).rejects.toThrow(
        new BadRequestException(CHAT_MESSAGES.CHAT_ALREADY_ENDED),
      );
    });

    it('should throw ForbiddenException if caller is not a participant', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue(null);
      vi.spyOn(prismaService.chatSession, 'findFirst').mockResolvedValue(null);

      await expect(chatService.endChat('chat-1', 'stranger')).rejects.toThrow(
        new ForbiddenException(CHAT_MESSAGES.NOT_PARTICIPANT),
      );
    });
  });

  // =========================================================================
  // validateParticipant
  // =========================================================================

  describe('validateParticipant', () => {
    it('should resolve without error when user is user1 in cached session', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
        user2Id: 'user-2',
      } as any);

      await expect(
        chatService.validateParticipant('chat-1', 'user-1'),
      ).resolves.toBeUndefined();

      expect(prismaService.chatSession.findFirst).not.toHaveBeenCalled();
    });

    it('should resolve without error when user is user2 in cached session', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
        user2Id: 'user-2',
      } as any);

      await expect(
        chatService.validateParticipant('chat-1', 'user-2'),
      ).resolves.toBeUndefined();
    });

    it('should throw ForbiddenException when user is not in cached session', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
        user2Id: 'user-2',
      } as any);

      await expect(
        chatService.validateParticipant('chat-1', 'outsider'),
      ).rejects.toThrow(new ForbiddenException(CHAT_MESSAGES.NOT_PARTICIPANT));
    });

    it('should resolve without error when user is found via DB fallback (cache miss)', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue(null);

      vi.spyOn(prismaService.chatSession, 'findFirst').mockResolvedValue({
        id: 'chat-1',
        user1Id: 'user-1',
        user2Id: 'user-2',
      } as any);

      await expect(
        chatService.validateParticipant('chat-1', 'user-1'),
      ).resolves.toBeUndefined();
    });

    it('should throw ForbiddenException when DB also confirms non-participant', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue(null);
      vi.spyOn(prismaService.chatSession, 'findFirst').mockResolvedValue(null);

      await expect(
        chatService.validateParticipant('chat-1', 'outsider'),
      ).rejects.toThrow(new ForbiddenException(CHAT_MESSAGES.NOT_PARTICIPANT));
    });
  });

  // =========================================================================
  // getChatSession
  // =========================================================================

  describe('getChatSession', () => {
    it('should return mapped session from Redis cache when present', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue(
        makeCachedSession() as any,
      );

      const result = await chatService.getChatSession('chat-1', 'user-1');

      expect(redisService.getChatSession).toHaveBeenCalledWith('chat-1');
      expect(prismaService.chatSession.findUnique).not.toHaveBeenCalled();
      expect(result.id).toBe('chat-1');
      expect(result.partner.id).toBe('user-2');
    });

    it('should throw ForbiddenException if cached session does not include caller', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue(
        makeCachedSession() as any,
      );

      await expect(
        chatService.getChatSession('chat-1', 'outsider'),
      ).rejects.toThrow(new ForbiddenException(CHAT_MESSAGES.NOT_PARTICIPANT));
    });

    it('should fall back to DB on cache miss and cache the result', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue(null);
      vi.spyOn(prismaService.chatSession, 'findUnique').mockResolvedValue(
        makeSession() as any,
      );

      const result = await chatService.getChatSession('chat-1', 'user-1');

      expect(prismaService.chatSession.findUnique).toHaveBeenCalled();
      expect(redisService.setChatSession).toHaveBeenCalledWith(
        'chat-1',
        expect.objectContaining({ id: 'chat-1' }),
      );
      expect(result.id).toBe('chat-1');
      expect(result.partner.id).toBe('user-2');
    });

    it('should throw NotFoundException when session is not in cache or DB', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue(null);
      vi.spyOn(prismaService.chatSession, 'findUnique').mockResolvedValue(null);

      await expect(
        chatService.getChatSession('chat-1', 'user-1'),
      ).rejects.toThrow(new NotFoundException(CHAT_MESSAGES.CHAT_NOT_FOUND));
    });

    it('should throw ForbiddenException when DB session does not include caller', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue(null);
      vi.spyOn(prismaService.chatSession, 'findUnique').mockResolvedValue(
        makeSession() as any,
      );

      await expect(
        chatService.getChatSession('chat-1', 'outsider'),
      ).rejects.toThrow(new ForbiddenException(CHAT_MESSAGES.NOT_PARTICIPANT));
    });

    it('should not call setChatSession when user2Id is missing from DB session', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue(null);
      vi.spyOn(prismaService.chatSession, 'findUnique').mockResolvedValue(
        makeSession({ user2Id: null, user2: null }) as any,
      );

      // user1 is the caller; user2 is missing so mapToSessionResponse should throw
      await expect(
        chatService.getChatSession('chat-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);

      expect(redisService.setChatSession).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getMyChatSessions
  // =========================================================================

  describe('getMyChatSessions', () => {
    it('should return all active sessions for user without venueId filter', async () => {
      const sessions = [makeSession(), makeSession({ id: 'chat-2' })];
      vi.spyOn(prismaService.chatSession, 'findMany').mockResolvedValue(
        sessions as any,
      );

      const result = await chatService.getMyChatSessions('user-1');

      expect(prismaService.chatSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: ChatSessionStatus.ACTIVE,
            OR: [{ user1Id: 'user-1' }, { user2Id: 'user-1' }],
          }),
        }),
      );
      expect(result).toHaveLength(2);
    });

    it('should apply venueId filter when provided', async () => {
      vi.spyOn(prismaService.chatSession, 'findMany').mockResolvedValue([]);

      await chatService.getMyChatSessions('user-1', 'venue-42');

      expect(prismaService.chatSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ venueId: 'venue-42' }),
        }),
      );
    });

    it('should return empty array when user has no active sessions', async () => {
      vi.spyOn(prismaService.chatSession, 'findMany').mockResolvedValue([]);

      const result = await chatService.getMyChatSessions('user-1');

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // getPartnerId
  // =========================================================================

  describe('getPartnerId', () => {
    it('should return user2Id from cache when caller is user1', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
        user2Id: 'user-2',
      } as any);

      const result = await chatService.getPartnerId('chat-1', 'user-1');

      expect(result).toBe('user-2');
      expect(prismaService.chatSession.findUnique).not.toHaveBeenCalled();
    });

    it('should return user1Id from cache when caller is user2', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue({
        user1Id: 'user-1',
        user2Id: 'user-2',
      } as any);

      const result = await chatService.getPartnerId('chat-1', 'user-2');

      expect(result).toBe('user-1');
    });

    it('should fall back to DB and return partner id when cache misses', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue(null);
      vi.spyOn(prismaService.chatSession, 'findUnique').mockResolvedValue({
        user1Id: 'user-1',
        user2Id: 'user-2',
      } as any);

      const result = await chatService.getPartnerId('chat-1', 'user-1');

      expect(result).toBe('user-2');
    });

    it('should return user1Id via DB when caller is user2 (cache miss)', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue(null);
      vi.spyOn(prismaService.chatSession, 'findUnique').mockResolvedValue({
        user1Id: 'user-1',
        user2Id: 'user-2',
      } as any);

      const result = await chatService.getPartnerId('chat-1', 'user-2');

      expect(result).toBe('user-1');
    });

    it('should throw NotFoundException when session is not found in DB', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue(null);
      vi.spyOn(prismaService.chatSession, 'findUnique').mockResolvedValue(null);

      await expect(
        chatService.getPartnerId('chat-1', 'user-1'),
      ).rejects.toThrow(new NotFoundException(CHAT_MESSAGES.CHAT_NOT_FOUND));
    });

    it('should throw ForbiddenException when caller is not a participant (DB path)', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue(null);
      vi.spyOn(prismaService.chatSession, 'findUnique').mockResolvedValue({
        user1Id: 'user-1',
        user2Id: 'user-2',
      } as any);

      await expect(
        chatService.getPartnerId('chat-1', 'outsider'),
      ).rejects.toThrow(new ForbiddenException(CHAT_MESSAGES.NOT_PARTICIPANT));
    });

    it('should throw NotFoundException when user is user1 but user2Id is null', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue(null);
      vi.spyOn(prismaService.chatSession, 'findUnique').mockResolvedValue({
        user1Id: 'user-1',
        user2Id: null,
      } as any);

      await expect(
        chatService.getPartnerId('chat-1', 'user-1'),
      ).rejects.toThrow(new NotFoundException('Partner not found'));
    });

    it('should throw NotFoundException when user is user2 but user1Id is null', async () => {
      vi.spyOn(redisService, 'getChatSession').mockResolvedValue(null);
      vi.spyOn(prismaService.chatSession, 'findUnique').mockResolvedValue({
        user1Id: null,
        user2Id: 'user-2',
      } as any);

      await expect(
        chatService.getPartnerId('chat-1', 'user-2'),
      ).rejects.toThrow(new NotFoundException('Partner not found'));
    });
  });

  // =========================================================================
  // checkExpiringChats
  // =========================================================================

  describe('checkExpiringChats', () => {
    it('should return sessions that expire within the next 5 minutes', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 3 * 60 * 1000); // 3 minutes from now

      vi.spyOn(prismaService.chatSession, 'findMany').mockResolvedValue([
        { id: 'chat-1', expiresAt },
        { id: 'chat-2', expiresAt: new Date(now.getTime() + 60 * 1000) },
      ] as any);

      const result = await chatService.checkExpiringChats();

      expect(prismaService.chatSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: ChatSessionStatus.ACTIVE,
            expiresAt: expect.objectContaining({
              gt: expect.any(Date),
              lt: expect.any(Date),
            }),
          }),
        }),
      );
      expect(result).toHaveLength(2);
      expect(result[0].chatSessionId).toBe('chat-1');
      expect(result[0].minutesLeft).toBeGreaterThanOrEqual(1);
    });

    it('should return empty array when no chats are expiring soon', async () => {
      vi.spyOn(prismaService.chatSession, 'findMany').mockResolvedValue([]);

      const result = await chatService.checkExpiringChats();

      expect(result).toEqual([]);
    });

    it('should calculate minutesLeft correctly (ceil of fractional minutes)', async () => {
      const now = new Date();
      // expires in 1.5 minutes → ceil = 2
      const expiresAt = new Date(now.getTime() + 90 * 1000);

      vi.spyOn(prismaService.chatSession, 'findMany').mockResolvedValue([
        { id: 'chat-1', expiresAt },
      ] as any);

      const result = await chatService.checkExpiringChats();

      expect(result[0].minutesLeft).toBe(2);
    });
  });

  // =========================================================================
  // cleanupExpiredChats
  // =========================================================================

  describe('cleanupExpiredChats', () => {
    it('should do nothing when there are no expired chats', async () => {
      vi.spyOn(prismaService.chatSession, 'findMany').mockResolvedValue([]);

      await chatService.cleanupExpiredChats();

      expect(prismaService.chatSession.update).not.toHaveBeenCalled();
      expect(redisService.deleteChatSession).not.toHaveBeenCalled();
    });

    it('should mark each expired chat as EXPIRED and clean up Redis', async () => {
      const expiredChats = [
        { id: 'chat-1', user1Id: 'user-1', user2Id: 'user-2' },
        { id: 'chat-2', user1Id: 'user-3', user2Id: 'user-4' },
      ];

      vi.spyOn(prismaService.chatSession, 'findMany').mockResolvedValue(
        expiredChats as any,
      );
      vi.spyOn(prismaService.chatSession, 'update').mockResolvedValue(
        {} as any,
      );
      vi.spyOn(redisService, 'deleteChatSession').mockResolvedValue(undefined);

      await chatService.cleanupExpiredChats();

      expect(prismaService.chatSession.update).toHaveBeenCalledTimes(2);
      expect(prismaService.chatSession.update).toHaveBeenCalledWith({
        where: { id: 'chat-1' },
        data: { status: ChatSessionStatus.EXPIRED },
      });
      expect(prismaService.chatSession.update).toHaveBeenCalledWith({
        where: { id: 'chat-2' },
        data: { status: ChatSessionStatus.EXPIRED },
      });
      expect(redisService.deleteChatSession).toHaveBeenCalledTimes(2);
      expect(redisService.deleteChatSession).toHaveBeenCalledWith(
        'chat-1',
        'user-1',
        'user-2',
      );
    });

    it('should skip Redis cleanup for expired chat with missing user ids', async () => {
      const expiredChats = [{ id: 'chat-1', user1Id: null, user2Id: null }];

      vi.spyOn(prismaService.chatSession, 'findMany').mockResolvedValue(
        expiredChats as any,
      );
      vi.spyOn(prismaService.chatSession, 'update').mockResolvedValue(
        {} as any,
      );

      await chatService.cleanupExpiredChats();

      expect(prismaService.chatSession.update).toHaveBeenCalledTimes(1);
      expect(redisService.deleteChatSession).not.toHaveBeenCalled();
    });

    it('should catch and log errors without throwing', async () => {
      vi.spyOn(prismaService.chatSession, 'findMany').mockRejectedValue(
        new Error('DB is down'),
      );

      // Must not throw
      await expect(chatService.cleanupExpiredChats()).resolves.toBeUndefined();
    });
  });
});
