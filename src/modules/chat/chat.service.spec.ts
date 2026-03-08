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
import { CHAT_MESSAGES } from '@/modules/chat/constants/messages';
import { RedisService } from '@/modules/redis/redis.service';

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
  });

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
  });

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
  });
});
