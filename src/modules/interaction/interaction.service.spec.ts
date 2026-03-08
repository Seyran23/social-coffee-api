import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InteractionType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { INTERACTION_MESSAGES } from '@/modules/interaction/constants/messages';
import { InteractionService } from '@/modules/interaction/interaction.service';
import { PresenceGateway } from '@/modules/presence/presence.gateway';
import { RedisService } from '@/modules/redis/redis.service';

describe('InteractionService', () => {
  let interactionService: InteractionService;
  let prismaService: PrismaService;
  let redisService: RedisService;
  let presenceGateway: PresenceGateway;

  // Mock data
  const actorId = 'actor-123';
  const targetId = 'target-456';
  const venueId = 'venue-789';

  beforeEach(async () => {
    // Create the testing module with mocked dependencies
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InteractionService,
        {
          provide: PrismaService,
          useValue: {
            interaction: {
              findUnique: vi.fn(),
              create: vi.fn(),
              deleteMany: vi.fn(),
            },
            chatSession: {
              create: vi.fn(),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            isUserAtVenue: vi.fn(),
            getUserActiveChatSession: vi.fn(),
            setChatSession: vi.fn(),
            addUnreadMatch: vi.fn(),
            trackMatch: vi.fn(),
            getUserCurrentVenue: vi.fn(),
          },
        },
        {
          provide: PresenceGateway,
          useValue: {
            notifyMatch: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            log: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    interactionService = module.get<InteractionService>(InteractionService);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
    presenceGateway = module.get<PresenceGateway>(PresenceGateway);
  });

  describe('likeUser', () => {
    it('should throw an error if user tries to like themselves', async () => {
      await expect(
        interactionService.likeUser(actorId, actorId, venueId),
      ).rejects.toThrow(
        new BadRequestException(INTERACTION_MESSAGES.SELF_LIKE),
      );
    });

    it('should throw an error if one of the users is not at the venue', async () => {
      // Actor is at venue, but target is not
      vi.spyOn(redisService, 'isUserAtVenue')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await expect(
        interactionService.likeUser(actorId, targetId, venueId),
      ).rejects.toThrow(
        new BadRequestException(INTERACTION_MESSAGES.NOT_AT_VENUE),
      );
    });

    it('should throw an error if an interaction already exists', async () => {
      vi.spyOn(redisService, 'isUserAtVenue').mockResolvedValue(true);

      // Simulate that an interaction already exists in the database
      vi.spyOn(prismaService.interaction, 'findUnique').mockResolvedValueOnce({
        id: 'inter-123',
        actorUserId: actorId,
        targetUserId: targetId,
        venueId,
        type: InteractionType.LIKE,
        createdAt: new Date(),
      });

      await expect(
        interactionService.likeUser(actorId, targetId, venueId),
      ).rejects.toThrow(
        new ConflictException(INTERACTION_MESSAGES.ALREADY_LIKED),
      );
    });

    it('should create an interaction and return { matched: false } if no mutual like', async () => {
      vi.spyOn(redisService, 'isUserAtVenue').mockResolvedValue(true);
      // No active chats
      vi.spyOn(redisService, 'getUserActiveChatSession').mockResolvedValue(
        null,
      );

      // First findUnique checks for existing like -> returns null
      // Second findUnique checks for mutual like -> returns null
      vi.spyOn(prismaService.interaction, 'findUnique')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await interactionService.likeUser(
        actorId,
        targetId,
        venueId,
      );

      expect(prismaService.interaction.create).toHaveBeenCalledWith({
        data: {
          venueId,
          actorUserId: actorId,
          targetUserId: targetId,
          type: InteractionType.LIKE,
        },
      });
      expect(result).toEqual({ matched: false });
    });

    it('should successfully handle a mutual match', async () => {
      vi.spyOn(redisService, 'isUserAtVenue').mockResolvedValue(true);
      vi.spyOn(redisService, 'getUserActiveChatSession').mockResolvedValue(
        null,
      );

      // Mutal Match Exists in DB
      vi.spyOn(prismaService.interaction, 'findUnique')
        .mockResolvedValueOnce(null) // No existing interaction from actor -> target
        .mockResolvedValueOnce({
          id: 'mutual-inter-123',
          actorUserId: targetId,
          targetUserId: actorId,
          venueId,
          type: InteractionType.LIKE,
          createdAt: new Date(),
        }); // Mutual interaction found!

      const mockChatSession = {
        id: 'chat-session-123',
        user1: { id: actorId, firstName: 'John', lastName: 'Doe' },
        user2: { id: targetId, firstName: 'Jane', lastName: 'Smith' },
        venue: { id: venueId, name: 'Cool Coffee' },
      };

      vi.spyOn(prismaService.chatSession, 'create').mockResolvedValueOnce(
        mockChatSession as any,
      );

      const result = await interactionService.likeUser(
        actorId,
        targetId,
        venueId,
      );

      // Assertions
      expect(result.matched).toBe(true);
      expect(result.chatSession?.id).toEqual('chat-session-123');
      expect(result.chatSession?.partner.id).toEqual(targetId);

      // Verify Redis bindings
      expect(redisService.setChatSession).toHaveBeenCalledWith(
        'chat-session-123',
        expect.any(Object),
      );
      expect(redisService.addUnreadMatch).toHaveBeenCalledWith(
        actorId,
        'chat-session-123',
      );
      expect(redisService.addUnreadMatch).toHaveBeenCalledWith(
        targetId,
        'chat-session-123',
      );

      // Verify interaction deletions
      expect(prismaService.interaction.deleteMany).toHaveBeenCalled();

      // Verify websocket notification
      expect(presenceGateway.notifyMatch).toHaveBeenCalledWith(
        actorId,
        targetId,
        expect.objectContaining({
          chatSessionId: 'chat-session-123',
          venueId,
        }),
      );
    });
  });
});
