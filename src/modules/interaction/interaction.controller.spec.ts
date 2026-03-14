import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponseBuilder } from '@/common/utils/response-builder';
import { INTERACTION_MESSAGES } from '@/modules/interaction/constants/messages';
import { InteractionController } from '@/modules/interaction/interaction.controller';
import { InteractionService } from '@/modules/interaction/interaction.service';

describe('InteractionController', () => {
  let interactionController: InteractionController;
  let interactionService: InteractionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InteractionController],
      providers: [
        {
          provide: InteractionService,
          useValue: {
            likeUser: vi.fn(),
            unlikeUser: vi.fn(),
            getMyLikes: vi.fn(),
            getLikedMe: vi.fn(),
          },
        },
      ],
    }).compile();

    interactionController = module.get<InteractionController>(
      InteractionController,
    );
    interactionService = module.get<InteractionService>(InteractionService);

    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('likeUser', () => {
    const likeDto: any = { targetUserId: 'user-2', venueId: 'venue-1' };

    it('should return LIKE_SUCCESS message when no match', async () => {
      const mockResult = { matched: false, likeId: 'like-1' };
      vi.spyOn(interactionService, 'likeUser').mockResolvedValue(
        mockResult as any,
      );

      const result = await interactionController.likeUser('user-1', likeDto);

      expect(interactionService.likeUser).toHaveBeenCalledWith(
        'user-1',
        'user-2',
        'venue-1',
      );
      expect(result).toEqual(
        ResponseBuilder.success(
          mockResult,
          INTERACTION_MESSAGES.LIKE_SUCCESS,
          HttpStatus.CREATED,
        ),
      );
    });

    it('should return MATCH_FOUND message when mutual match', async () => {
      const mockResult = { matched: true, chatSessionId: 'chat-1' };
      vi.spyOn(interactionService, 'likeUser').mockResolvedValue(
        mockResult as any,
      );

      const result = await interactionController.likeUser('user-1', likeDto);

      expect(result).toEqual(
        ResponseBuilder.success(
          mockResult,
          INTERACTION_MESSAGES.MATCH_FOUND,
          HttpStatus.CREATED,
        ),
      );
    });
  });

  describe('unlikeUser', () => {
    it('should unlike user and return success', async () => {
      const result = await interactionController.unlikeUser('user-1', 'user-2');

      expect(interactionService.unlikeUser).toHaveBeenCalledWith(
        'user-1',
        'user-2',
      );
      expect(result).toEqual(
        ResponseBuilder.success(null, INTERACTION_MESSAGES.UNLIKE_SUCCESS),
      );
    });
  });

  describe('getMyLikes', () => {
    it('should return list of liked users', async () => {
      const mockLikes = [{ id: 'user-2', firstName: 'Jane' }];
      vi.spyOn(interactionService, 'getMyLikes').mockResolvedValue(
        mockLikes as any,
      );

      const result = await interactionController.getMyLikes('user-1');

      expect(interactionService.getMyLikes).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(
        ResponseBuilder.success(
          mockLikes,
          INTERACTION_MESSAGES.MY_LIKES_RETRIEVED,
        ),
      );
    });
  });

  describe('getLikedMe', () => {
    it('should return list of users who liked me', async () => {
      const mockLikedMe = [{ id: 'user-3', firstName: 'Bob' }];
      vi.spyOn(interactionService, 'getLikedMe').mockResolvedValue(
        mockLikedMe as any,
      );

      const result = await interactionController.getLikedMe('user-1');

      expect(interactionService.getLikedMe).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(
        ResponseBuilder.success(
          mockLikedMe,
          INTERACTION_MESSAGES.LIKED_ME_RETRIEVED,
        ),
      );
    });
  });
});
