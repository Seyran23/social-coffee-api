import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '@/common/logger/logger.service';
import { WS_EVENTS } from '@/modules/presence/constants/ws-event-namings';
import { PresenceService } from '@/modules/presence/presence.service';
import { ProfileService } from '@/modules/profile/profile.service';
import { RedisService } from '@/modules/redis/redis.service';

describe('PresenceService', () => {
  let presenceService: PresenceService;
  let redisService: RedisService;
  let profileService: ProfileService;

  let mockClient: any;
  let mockServer: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.spyOn(global, 'setTimeout');
    vi.spyOn(global, 'clearTimeout');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PresenceService,
        {
          provide: RedisService,
          useValue: {
            getUserCurrentVenue: vi.fn(),
            updateHeartbeat: vi.fn(),
          },
        },
        {
          provide: ProfileService,
          useValue: {
            discoverProfiles: vi.fn(),
            getUserProfile: vi.fn(),
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

    presenceService = module.get<PresenceService>(PresenceService);
    redisService = module.get<RedisService>(RedisService);
    profileService = module.get<ProfileService>(ProfileService);

    mockClient = {
      id: 'socket-123',
      user: { userId: 'user-1' },
      venue: undefined,
      emit: vi.fn(),
      join: vi.fn(),
      to: vi.fn().mockReturnThis(),
      disconnect: vi.fn(),
    };

    mockServer = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('handleUserConnection', () => {
    it('should disconnect if user is not checked in', async () => {
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValue(null);

      await presenceService.handleUserConnection(mockClient);

      expect(mockClient.emit).toHaveBeenCalledWith(WS_EVENTS.ERROR, {
        message: 'Not checked in. Please check in first.',
      });
      expect(mockClient.disconnect).toHaveBeenCalled();
      expect(mockClient.join).not.toHaveBeenCalled();
    });

    it('should successfully connect, set map, emit feed and broadcast presence', async () => {
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValue(
        'venue-1',
      );

      const mockProfiles = [{ id: 'user-2' }];
      vi.spyOn(profileService, 'discoverProfiles').mockResolvedValue(
        mockProfiles as any,
      );

      const mockMyProfile = { id: 'user-1', firstName: 'Test' };
      vi.spyOn(profileService, 'getUserProfile').mockResolvedValue(
        mockMyProfile as any,
      );

      // Trigger the connection
      await presenceService.handleUserConnection(mockClient);

      // Verify Redis and Venue setup
      expect(redisService.updateHeartbeat).toHaveBeenCalledWith('user-1');
      expect(mockClient.join).toHaveBeenCalledWith('venue:venue-1');
      expect(mockClient.venue).toEqual({ id: 'venue-1' });

      // Verify Initial Feed
      expect(mockClient.emit).toHaveBeenCalledWith(WS_EVENTS.FEED_INITIAL, {
        users: mockProfiles,
        timestamp: expect.any(Number),
      });

      // Verify Broadcast Join (socket.to(...) so sender doesn't receive his own join event)
      expect(mockClient.to).toHaveBeenCalledWith('venue:venue-1');
      expect(mockClient.emit).toHaveBeenCalledWith(WS_EVENTS.USER_JOINED, {
        user: mockMyProfile,
        timestamp: expect.any(Number),
      });
    });
  });

  describe('handleUserDisconnection', () => {
    it('should start a disconnection grace period timer', () => {
      mockClient.venue = { id: 'venue-1' };

      presenceService.handleUserDisconnection(mockClient);

      expect(setTimeout).toHaveBeenCalled();
    });

    it('should clear old timer if disconnecting again', () => {
      mockClient.venue = { id: 'venue-1' };

      presenceService.handleUserDisconnection(mockClient);
      const firstCallCount = vi.mocked(clearTimeout).mock.calls.length;

      // Disconnect again should clear previous timer
      presenceService.handleUserDisconnection(mockClient);

      expect(clearTimeout).toHaveBeenCalledTimes(firstCallCount + 1);
    });
  });

  describe('handleHeartbeat', () => {
    it('should return without updating if invalid socket data', async () => {
      mockClient.user.userId = null;

      await presenceService.handleHeartbeat(mockClient);

      expect(redisService.updateHeartbeat).not.toHaveBeenCalled();
      expect(mockClient.emit).not.toHaveBeenCalled();
    });

    it('should update heartbeat and send ack event', async () => {
      mockClient.venue = { id: 'venue-1' };

      await presenceService.handleHeartbeat(mockClient);

      expect(redisService.updateHeartbeat).toHaveBeenCalledWith('user-1');
      expect(mockClient.emit).toHaveBeenCalledWith(WS_EVENTS.HEARTBEAT_ACK, {
        timestamp: expect.any(Number),
      });
    });
  });

  describe('broadcastUserJoined', () => {
    it('should broadcast to server room', async () => {
      const mockProfile = { id: 'user-1', firstName: 'John' };
      vi.spyOn(profileService, 'getUserProfile').mockResolvedValue(
        mockProfile as any,
      );

      await presenceService.broadcastUserJoined(
        'user-1',
        'venue-1',
        mockServer,
      );

      expect(mockServer.to).toHaveBeenCalledWith('venue:venue-1');
      expect(mockServer.emit).toHaveBeenCalledWith(WS_EVENTS.USER_JOINED, {
        user: mockProfile,
        timestamp: expect.any(Number),
      });
    });
  });

  describe('broadcastUserLeft', () => {
    it('should broadcast user_left to server room', async () => {
      await presenceService.broadcastUserLeft('user-1', 'venue-1', mockServer);

      expect(mockServer.to).toHaveBeenCalledWith('venue:venue-1');
      expect(mockServer.emit).toHaveBeenCalledWith(WS_EVENTS.USER_LEFT, {
        userId: 'user-1',
        timestamp: expect.any(Number),
      });
    });
  });
});
