import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponseBuilder } from '@/common/utils/response-builder';
import { ChatController } from '@/modules/chat/chat.controller';
import { ChatService } from '@/modules/chat/chat.service';

describe('ChatController', () => {
  let chatController: ChatController;
  let chatService: ChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: {
            getMyChatSessions: vi.fn(),
          },
        },
      ],
    }).compile();

    chatController = module.get<ChatController>(ChatController);
    chatService = module.get<ChatService>(ChatService);

    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getMyChatSessions', () => {
    it('should return chat sessions for the user', async () => {
      const mockSessions = [
        { id: 'session-1', status: 'ACTIVE' },
        { id: 'session-2', status: 'ACTIVE' },
      ];
      vi.spyOn(chatService, 'getMyChatSessions').mockResolvedValue(mockSessions as any);

      const result = await chatController.getMyChatSessions('user-1');

      expect(chatService.getMyChatSessions).toHaveBeenCalledWith('user-1', undefined);
      expect(result).toEqual(
        ResponseBuilder.success(mockSessions, 'Chat sessions retrieved successfully'),
      );
    });

    it('should pass optional venueId filter to ChatService', async () => {
      const mockSessions = [{ id: 'session-1', status: 'ACTIVE' }];
      vi.spyOn(chatService, 'getMyChatSessions').mockResolvedValue(mockSessions as any);

      const result = await chatController.getMyChatSessions('user-1', 'venue-1');

      expect(chatService.getMyChatSessions).toHaveBeenCalledWith('user-1', 'venue-1');
      expect(result).toEqual(
        ResponseBuilder.success(mockSessions, 'Chat sessions retrieved successfully'),
      );
    });

    it('should return empty array when user has no sessions', async () => {
      vi.spyOn(chatService, 'getMyChatSessions').mockResolvedValue([]);

      const result = await chatController.getMyChatSessions('user-1');

      expect(result).toEqual(
        ResponseBuilder.success([], 'Chat sessions retrieved successfully'),
      );
    });
  });
});
