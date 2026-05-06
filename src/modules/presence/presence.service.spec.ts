import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
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
        {
          provide: PrismaService,
          useValue: {
            venue: { findUnique: vi.fn() },
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
    const mockServer = {
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    } as any;

    it('should start a disconnection grace period timer', () => {
      mockClient.venue = { id: 'venue-1' };

      presenceService.handleUserDisconnection(mockClient, mockServer);

      expect(setTimeout).toHaveBeenCalled();
    });

    it('should clear old timer if disconnecting again', () => {
      mockClient.venue = { id: 'venue-1' };

      presenceService.handleUserDisconnection(mockClient, mockServer);
      const firstCallCount = vi.mocked(clearTimeout).mock.calls.length;

      // Disconnect again should clear previous timer
      presenceService.handleUserDisconnection(mockClient, mockServer);

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

  describe('handleUserDisconnection — early-return paths', () => {
    it('should warn and return early when userId is missing', () => {
      mockClient.user = { userId: undefined };
      mockClient.venue = { id: 'venue-1' };

      presenceService.handleUserDisconnection(mockClient, mockServer);

      expect(setTimeout).not.toHaveBeenCalled();
    });

    it('should warn and return early when venueId is missing', () => {
      mockClient.venue = undefined;

      presenceService.handleUserDisconnection(mockClient, mockServer);

      expect(setTimeout).not.toHaveBeenCalled();
    });
  });

  describe('handleHeartbeat — with coordinates', () => {
    it('should call checkGeofenceOrCheckOut when coordinates are provided and user is inside boundary', async () => {
      mockClient.venue = { id: 'venue-1' };

      // Access private database via the module — re-build a fresh module here
      // so we can control the database mock independently.
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PresenceService,
          {
            provide: RedisService,
            useValue: {
              getUserCurrentVenue: vi.fn(),
              updateHeartbeat: vi.fn(),
              removeUserFromVenue: vi.fn(),
            },
          },
          {
            provide: ProfileService,
            useValue: { discoverProfiles: vi.fn(), getUserProfile: vi.fn() },
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
          {
            provide: PrismaService,
            useValue: {
              venue: {
                findUnique: vi.fn().mockResolvedValue({
                  latitude: 48.8566,
                  longitude: 2.3522,
                  geofenceMeters: 500,
                }),
              },
            },
          },
        ],
      }).compile();

      const svc = module.get<PresenceService>(PresenceService);
      const socket: any = {
        id: 'socket-abc',
        user: { userId: 'user-1' },
        venue: { id: 'venue-1' },
        emit: vi.fn(),
        disconnect: vi.fn(),
      };

      // Coordinates very close to the venue — should stay connected
      await svc.handleHeartbeat(socket, {
        latitude: 48.8566,
        longitude: 2.3522,
      });

      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith(
        WS_EVENTS.HEARTBEAT_ACK,
        expect.any(Object),
      );
    });

    it('should disconnect socket when user is outside geofence boundary', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PresenceService,
          {
            provide: RedisService,
            useValue: {
              getUserCurrentVenue: vi.fn(),
              updateHeartbeat: vi.fn(),
              removeUserFromVenue: vi.fn(),
            },
          },
          {
            provide: ProfileService,
            useValue: { discoverProfiles: vi.fn(), getUserProfile: vi.fn() },
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
          {
            provide: PrismaService,
            useValue: {
              venue: {
                findUnique: vi.fn().mockResolvedValue({
                  latitude: 48.8566,
                  longitude: 2.3522,
                  geofenceMeters: 10, // very tight fence
                }),
              },
            },
          },
        ],
      }).compile();

      const svc = module.get<PresenceService>(PresenceService);
      const redis = module.get<RedisService>(RedisService);
      vi.spyOn(redis, 'removeUserFromVenue').mockResolvedValue(undefined);

      const socket: any = {
        id: 'socket-abc',
        user: { userId: 'user-1' },
        venue: { id: 'venue-1' },
        emit: vi.fn(),
        disconnect: vi.fn(),
      };

      // Coordinates far away
      await svc.handleHeartbeat(socket, {
        latitude: 51.5074, // London
        longitude: -0.1278,
      });

      expect(socket.emit).toHaveBeenCalledWith(WS_EVENTS.ERROR, {
        message: 'You have left the venue. You have been checked out.',
      });
      expect(socket.disconnect).toHaveBeenCalled();
    });

    it('should skip geofence check when venue has no coordinates', async () => {
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
            useValue: { discoverProfiles: vi.fn(), getUserProfile: vi.fn() },
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
          {
            provide: PrismaService,
            useValue: {
              venue: {
                // Venue has no lat/lon
                findUnique: vi.fn().mockResolvedValue({
                  latitude: null,
                  longitude: null,
                  geofenceMeters: null,
                }),
              },
            },
          },
        ],
      }).compile();

      const svc = module.get<PresenceService>(PresenceService);
      const socket: any = {
        id: 'socket-abc',
        user: { userId: 'user-1' },
        venue: { id: 'venue-1' },
        emit: vi.fn(),
        disconnect: vi.fn(),
      };

      await svc.handleHeartbeat(socket, {
        latitude: 51.5074,
        longitude: -0.1278,
      });

      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith(
        WS_EVENTS.HEARTBEAT_ACK,
        expect.any(Object),
      );
    });
  });

  describe('startDisconnectionGracePeriod — cancels existing timer first', () => {
    it('should cancel an existing timer before starting a new one', () => {
      mockClient.venue = { id: 'venue-1' };

      // First disconnection — sets a timer
      presenceService.handleUserDisconnection(mockClient, mockServer);
      const clearTimeoutCallsAfterFirst =
        vi.mocked(clearTimeout).mock.calls.length;

      // Second disconnection for the same user — should clear the first timer
      presenceService.handleUserDisconnection(mockClient, mockServer);

      expect(vi.mocked(clearTimeout).mock.calls.length).toBeGreaterThan(
        clearTimeoutCallsAfterFirst,
      );
      // Two timers should have been created in total
      expect(setTimeout).toHaveBeenCalledTimes(2);
    });
  });

  describe('cancelDisconnectionTimer', () => {
    it('should clear the stored timer when one exists (via reconnection path)', async () => {
      mockClient.venue = { id: 'venue-1' };

      // Trigger a disconnection to prime a timer
      presenceService.handleUserDisconnection(mockClient, mockServer);

      // Now simulate a reconnection — handleUserConnection calls cancelDisconnectionTimer
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValue(
        'venue-1',
      );
      vi.spyOn(profileService, 'discoverProfiles').mockResolvedValue({
        profiles: [],
        total: 0,
        nextCursor: null,
        hasMore: false,
      } as any);
      vi.spyOn(profileService, 'getUserProfile').mockResolvedValue({
        id: 'user-1',
      } as any);

      const clearCallsBefore = vi.mocked(clearTimeout).mock.calls.length;
      await presenceService.handleUserConnection(mockClient);

      expect(vi.mocked(clearTimeout).mock.calls.length).toBeGreaterThan(
        clearCallsBefore,
      );
    });

    it('should do nothing when no timer exists for the user', async () => {
      // No prior disconnection — no timer stored
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValue(
        'venue-1',
      );
      vi.spyOn(profileService, 'discoverProfiles').mockResolvedValue({
        profiles: [],
        total: 0,
        nextCursor: null,
        hasMore: false,
      } as any);
      vi.spyOn(profileService, 'getUserProfile').mockResolvedValue({
        id: 'user-1',
      } as any);

      const clearCallsBefore = vi.mocked(clearTimeout).mock.calls.length;
      await presenceService.handleUserConnection(mockClient);

      // clearTimeout should NOT have been called for a non-existent timer
      expect(vi.mocked(clearTimeout).mock.calls.length).toBe(clearCallsBefore);
    });
  });

  describe('sendInitialFeed', () => {
    it('should emit feed_initial on success', async () => {
      const profiles = {
        profiles: [{ id: 'user-2' }],
        total: 1,
        nextCursor: null,
        hasMore: false,
      };
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValue(
        'venue-1',
      );
      vi.spyOn(profileService, 'discoverProfiles').mockResolvedValue(
        profiles as any,
      );
      vi.spyOn(profileService, 'getUserProfile').mockResolvedValue({
        id: 'user-1',
      } as any);

      await presenceService.handleUserConnection(mockClient);

      expect(mockClient.emit).toHaveBeenCalledWith(
        WS_EVENTS.FEED_INITIAL,
        expect.objectContaining({ users: profiles }),
      );
    });

    it('should emit error event when discoverProfiles throws', async () => {
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValue(
        'venue-1',
      );
      vi.spyOn(profileService, 'discoverProfiles').mockRejectedValue(
        new Error('db error'),
      );
      vi.spyOn(profileService, 'getUserProfile').mockResolvedValue({
        id: 'user-1',
      } as any);

      await presenceService.handleUserConnection(mockClient);

      expect(mockClient.emit).toHaveBeenCalledWith(WS_EVENTS.ERROR, {
        message: 'Failed to load initial feed',
      });
    });
  });

  describe('notifyVenueUserJoined — server path', () => {
    it('should use server.to().emit() when only server is provided (broadcastUserJoined)', async () => {
      const mockProfile = { id: 'user-1', firstName: 'Alice' };
      vi.spyOn(profileService, 'getUserProfile').mockResolvedValue(
        mockProfile as any,
      );

      await presenceService.broadcastUserJoined(
        'user-1',
        'venue-1',
        mockServer,
      );

      expect(mockServer.to).toHaveBeenCalledWith('venue:venue-1');
      expect(mockServer.emit).toHaveBeenCalledWith(
        WS_EVENTS.USER_JOINED,
        expect.objectContaining({ user: mockProfile }),
      );
    });

    it('should not throw when getUserProfile rejects', async () => {
      vi.spyOn(profileService, 'getUserProfile').mockRejectedValue(
        new Error('not found'),
      );

      await expect(
        presenceService.broadcastUserJoined('user-1', 'venue-1', mockServer),
      ).resolves.toBeUndefined();
    });
  });

  describe('notifyVenueUserLeft', () => {
    it('should call server.to().emit() with USER_LEFT event', async () => {
      await presenceService.broadcastUserLeft('user-x', 'venue-x', mockServer);

      expect(mockServer.to).toHaveBeenCalledWith('venue:venue-x');
      expect(mockServer.emit).toHaveBeenCalledWith(
        WS_EVENTS.USER_LEFT,
        expect.objectContaining({ userId: 'user-x' }),
      );
    });
  });

  describe('startDisconnectionGracePeriod — grace timer fires', () => {
    it('should emit user_left to the venue room after grace period when user has not reconnected', async () => {
      mockClient.venue = { id: 'venue-1' };

      // The user is still at the same venue when the timer fires
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValue(
        'venue-1',
      );

      presenceService.handleUserDisconnection(mockClient, mockServer);

      // Advance fake timers past the grace period
      await vi.runAllTimersAsync();

      expect(mockServer.to).toHaveBeenCalledWith('venue:venue-1');
      expect(mockServer.emit).toHaveBeenCalledWith(
        WS_EVENTS.USER_LEFT,
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('should NOT broadcast when user reconnects during grace period', async () => {
      mockClient.venue = { id: 'venue-1' };

      const broadcastSpy = vi
        .spyOn(presenceService, 'broadcastUserLeft')
        .mockResolvedValue(undefined);

      // Prime the reconnection: add user back to socket map via connection
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValue(
        'venue-1',
      );
      vi.spyOn(profileService, 'discoverProfiles').mockResolvedValue({
        profiles: [],
        total: 0,
        nextCursor: null,
        hasMore: false,
      } as any);
      vi.spyOn(profileService, 'getUserProfile').mockResolvedValue({
        id: 'user-1',
      } as any);

      presenceService.handleUserDisconnection(mockClient, mockServer);

      // Simulate reconnect before timer fires
      await presenceService.handleUserConnection(mockClient);

      await vi.runAllTimersAsync();

      expect(broadcastSpy).not.toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear all disconnection timers on destroy', () => {
      mockClient.venue = { id: 'venue-1' };
      presenceService.handleUserDisconnection(mockClient, mockServer);

      presenceService.onModuleDestroy();

      // clearTimeout should have been called for the outstanding timer
      expect(clearTimeout).toHaveBeenCalled();
    });
  });
});
