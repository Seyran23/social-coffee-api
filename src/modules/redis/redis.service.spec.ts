import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '@/common/logger/logger.service';
import { REDIS_LIMITS } from '@/modules/redis/constants/limits';
import { REDIS_KEY_PREFIX } from '@/modules/redis/constants/prefixes';
import { REDIS_TTL } from '@/modules/redis/constants/time-to-live';
import { RedisService } from '@/modules/redis/redis.service';

describe('RedisService', () => {
  let redisService: RedisService;
  let mockRedis: any;

  beforeEach(async () => {
    vi.useFakeTimers();

    mockRedis = {
      setex: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
      lpush: vi.fn(),
      ltrim: vi.fn(),
      expire: vi.fn(),
      lrange: vi.fn(),
      incr: vi.fn(),
      sadd: vi.fn(),
      srem: vi.fn(),
      scard: vi.fn(),
      smembers: vi.fn(),
      sismember: vi.fn(),
      hincrby: vi.fn(),
      hgetall: vi.fn(),
      keys: vi.fn(),
      ping: vi.fn(),
      info: vi.fn(),
      quit: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: 'REDIS_CLIENT',
          useValue: mockRedis,
        },
        {
          provide: LoggerService,
          useValue: {
            log: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
          },
        },
      ],
    }).compile();

    redisService = module.get<RedisService>(RedisService);

    // Replace dynamic timestamp to test accurately
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Lifecycle', () => {
    it('should close redis connection onModuleDestroy', async () => {
      await redisService.onModuleDestroy();
      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });

  describe('Heartbeat & Activity', () => {
    it('should update user heartbeat', async () => {
      await redisService.updateHeartbeat('user-1');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `${REDIS_KEY_PREFIX.HEARTBEAT}:user-1`,
        REDIS_TTL.HEARTBEAT,
        Date.now().toString(),
      );
    });

    it('should correctly evaluate if user is active', async () => {
      mockRedis.get.mockResolvedValue(Date.now().toString()); // exactly now
      const result = await redisService.isUserActive('user-1');
      expect(result).toBe(true);

      mockRedis.get.mockResolvedValue((Date.now() - 600000).toString()); // 10 minutes ago
      const result2 = await redisService.isUserActive('user-2');
      expect(result2).toBe(false); // Threshold is 5 mins (300ms)
    });
  });

  describe('Chat Session Management', () => {
    const mockSessionData = {
      id: 'chat-1',
      user1Id: 'user-1',
      user2Id: 'user-2',
      venueId: 'venue-1',
      status: 'ACTIVE',
      startedAt: Date.now(),
      expiresAt: Date.now() + 300000,
    };

    it('should set chat session correctly across multiple keys', async () => {
      await redisService.setChatSession('chat-1', mockSessionData);

      expect(mockRedis.setex).toHaveBeenCalledTimes(3);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `${REDIS_KEY_PREFIX.CHAT_SESSION}:chat-1`,
        REDIS_TTL.CHAT_SESSION,
        JSON.stringify(mockSessionData),
      );
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `${REDIS_KEY_PREFIX.CHAT_USER}:user-1`,
        REDIS_TTL.CHAT_SESSION,
        'chat-1',
      );
    });

    it('should cache message and trim list', async () => {
      const msg = {
        id: 'msg-1',
        senderId: 'u1',
        content: 'hello',
        timestamp: Date.now(),
      };
      await redisService.cacheMessage('chat-1', msg);

      const key = `${REDIS_KEY_PREFIX.CHAT_MESSAGES}:chat-1`;
      expect(mockRedis.lpush).toHaveBeenCalledWith(key, JSON.stringify(msg));
      expect(mockRedis.ltrim).toHaveBeenCalledWith(
        key,
        0,
        REDIS_LIMITS.MAX_CACHED_MESSAGES - 1,
      );
      expect(mockRedis.expire).toHaveBeenCalledWith(
        key,
        REDIS_TTL.CHAT_MESSAGES_CACHE,
      );
    });

    it('should parse and reverse cached messages', async () => {
      const msg1 = { id: 'msg-1' };
      const msg2 = { id: 'msg-2' };
      mockRedis.lrange.mockResolvedValue([
        JSON.stringify(msg2),
        JSON.stringify(msg1),
      ]);

      const result = await redisService.getCachedMessages('chat-1', 10);

      expect(mockRedis.lrange).toHaveBeenCalledWith(
        `${REDIS_KEY_PREFIX.CHAT_MESSAGES}:chat-1`,
        0,
        9,
      );
      expect(result).toEqual([msg1, msg2]); // Reversed
    });
  });

  describe('Rate Limiting', () => {
    it('should properly track and return rate limit allowance', async () => {
      // First event
      mockRedis.incr.mockResolvedValue(1);
      const res1 = await redisService.checkRateLimit('ip-1', 5, 60);
      expect(mockRedis.expire).toHaveBeenCalledWith('ratelimit:ip-1', 60);
      expect(res1.allowed).toBe(true);
      expect(res1.remaining).toBe(4);

      // Fifth event (Boundary)
      mockRedis.incr.mockResolvedValue(5);
      const res5 = await redisService.checkRateLimit('ip-1', 5, 60);
      expect(res5.allowed).toBe(true);
      expect(res5.remaining).toBe(0);

      // Sixth event (Blocked)
      mockRedis.incr.mockResolvedValue(6);
      const res6 = await redisService.checkRateLimit('ip-1', 5, 60);
      expect(res6.allowed).toBe(false);
      expect(res6.remaining).toBe(0);
    });
  });

  describe('Venue Presence Tracking', () => {
    it('should add user to venue sets correctly', async () => {
      await redisService.addUserToVenue('user-1', 'venue-1');

      expect(mockRedis.sadd).toHaveBeenCalledWith(
        'venue:venue-1:users',
        'user-1',
      );
      expect(mockRedis.sadd).toHaveBeenCalledWith('active_venues', 'venue-1');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `user:user-1:venue`,
        REDIS_TTL.VENUE_PRESENCE,
        'venue-1',
      );
    });

    it('should remove user from venue and clean up active venues if empty', async () => {
      mockRedis.scard.mockResolvedValue(0);

      await redisService.removeUserFromVenue('user-1', 'venue-1');

      expect(mockRedis.srem).toHaveBeenCalledWith(
        'venue:venue-1:users',
        'user-1',
      );
      expect(mockRedis.del).toHaveBeenCalledWith('user:user-1:venue');
      // Called because scard is 0
      expect(mockRedis.srem).toHaveBeenCalledWith('active_venues', 'venue-1');
    });
  });

  describe('Profile Caching', () => {
    it('should stringify and cache profile', async () => {
      await redisService.cacheProfile('user-1', {
        id: 'user-1',
        firstName: 'Test',
      } as any);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'profile:user-1',
        REDIS_TTL.PROFILE_CACHE,
        JSON.stringify({ id: 'user-1', firstName: 'Test' }),
      );
    });

    it('should return parsed profile when cached', async () => {
      const profile = { id: 'user-2', firstName: 'Alice', lastName: 'W' };
      mockRedis.get.mockResolvedValue(JSON.stringify(profile));

      const result = await redisService.getCachedProfile('user-2');

      expect(mockRedis.get).toHaveBeenCalledWith('profile:user-2');
      expect(result).toEqual(profile);
    });

    it('should return null when no profile cached', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await redisService.getCachedProfile('user-99');

      expect(result).toBeNull();
    });

    it('should delete the profile cache key on invalidation', async () => {
      await redisService.invalidateProfile('user-3');

      expect(mockRedis.del).toHaveBeenCalledWith('profile:user-3');
    });
  });

  // -----------------------------------------------------------------------
  // Heartbeat & Activity — additional paths
  // -----------------------------------------------------------------------
  describe('Heartbeat & Activity — additional paths', () => {
    it('should return null from getLastHeartbeat when key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await redisService.getLastHeartbeat('user-no-hb');

      expect(result).toBeNull();
    });

    it('should return parsed timestamp from getLastHeartbeat when key exists', async () => {
      const ts = Date.now();
      mockRedis.get.mockResolvedValue(ts.toString());

      const result = await redisService.getLastHeartbeat('user-hb');

      expect(result).toBe(ts);
    });

    it('should return false from isUserActive when no heartbeat exists', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await redisService.isUserActive('inactive-user');

      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Chat Session Management — additional paths
  // -----------------------------------------------------------------------
  describe('Chat Session Management — additional paths', () => {
    it('should delete session and both user chat keys', async () => {
      await redisService.deleteChatSession('chat-x', 'user-1', 'user-2');

      expect(mockRedis.del).toHaveBeenCalledWith(
        `${REDIS_KEY_PREFIX.CHAT_SESSION}:chat-x`,
        `${REDIS_KEY_PREFIX.CHAT_USER}:user-1`,
        `${REDIS_KEY_PREFIX.CHAT_USER}:user-2`,
      );
    });

    it('should return null from getChatSession when key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await redisService.getChatSession('ghost-session');

      expect(result).toBeNull();
    });

    it('should return parsed session from getChatSession when key exists', async () => {
      const session = {
        id: 'chat-1',
        user1Id: 'u1',
        user2Id: 'u2',
        venueId: 'v1',
        status: 'ACTIVE',
        startedAt: 1000,
        expiresAt: 2000,
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(session));

      const result = await redisService.getChatSession('chat-1');

      expect(result).toEqual(session);
    });
  });

  // -----------------------------------------------------------------------
  // Socket Mapping
  // -----------------------------------------------------------------------
  describe('Socket Mapping', () => {
    it('should set both user->socket and socket->user keys', async () => {
      await redisService.setUserSocket('user-1', 'sock-abc');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `${REDIS_KEY_PREFIX.SOCKET_USER}:user-1`,
        REDIS_TTL.SOCKET_MAPPING,
        'sock-abc',
      );
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'socket:sock-abc',
        REDIS_TTL.SOCKET_MAPPING,
        'user-1',
      );
    });

    it('should return socket id for a user', async () => {
      mockRedis.get.mockResolvedValue('sock-abc');

      const result = await redisService.getUserSocket('user-1');

      expect(mockRedis.get).toHaveBeenCalledWith(
        `${REDIS_KEY_PREFIX.SOCKET_USER}:user-1`,
      );
      expect(result).toBe('sock-abc');
    });

    it('should return null when user has no socket', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await redisService.getUserSocket('user-no-sock');

      expect(result).toBeNull();
    });

    it('should delete both keys when deleteUserSocket is called and socket exists', async () => {
      mockRedis.get.mockResolvedValue('sock-xyz');

      await redisService.deleteUserSocket('user-1');

      expect(mockRedis.del).toHaveBeenCalledWith(
        `${REDIS_KEY_PREFIX.SOCKET_USER}:user-1`,
      );
      expect(mockRedis.del).toHaveBeenCalledWith('socket:sock-xyz');
    });

    it('should not call del when user has no socket to delete', async () => {
      mockRedis.get.mockResolvedValue(null);

      await redisService.deleteUserSocket('user-ghost');

      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Venue Presence Tracking — additional paths
  // -----------------------------------------------------------------------
  describe('Venue Presence Tracking — additional paths', () => {
    it('should NOT remove venue from active_venues when users remain after removal', async () => {
      mockRedis.scard.mockResolvedValue(2);

      await redisService.removeUserFromVenue('user-2', 'venue-busy');

      expect(mockRedis.srem).toHaveBeenCalledWith(
        'venue:venue-busy:users',
        'user-2',
      );
      // active_venues should NOT be touched because scard > 0
      expect(mockRedis.srem).not.toHaveBeenCalledWith(
        'active_venues',
        'venue-busy',
      );
    });

    it('should return active venue ids', async () => {
      mockRedis.smembers.mockResolvedValue(['venue-1', 'venue-2']);

      const result = await redisService.getActiveVenueIds();

      expect(mockRedis.smembers).toHaveBeenCalledWith('active_venues');
      expect(result).toEqual(['venue-1', 'venue-2']);
    });
  });

  // -----------------------------------------------------------------------
  // Venue Presence Tracking — additional venue query paths
  // -----------------------------------------------------------------------
  describe('Venue Presence Tracking — venue query helpers', () => {
    it('should return users at a venue', async () => {
      mockRedis.smembers.mockResolvedValue(['user-1', 'user-2']);

      const result = await redisService.getUsersAtVenue('venue-1');

      expect(mockRedis.smembers).toHaveBeenCalledWith('venue:venue-1:users');
      expect(result).toEqual(['user-1', 'user-2']);
    });

    it('should return current venue for user', async () => {
      mockRedis.get.mockResolvedValue('venue-42');

      const result = await redisService.getUserCurrentVenue('user-1');

      expect(mockRedis.get).toHaveBeenCalledWith('user:user-1:venue');
      expect(result).toBe('venue-42');
    });

    it('should return null from getUserCurrentVenue when user has no venue', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await redisService.getUserCurrentVenue('user-ghost');

      expect(result).toBeNull();
    });

    it('should return true from isUserAtVenue when member exists', async () => {
      mockRedis.sismember.mockResolvedValue(1);

      const result = await redisService.isUserAtVenue('user-1', 'venue-1');

      expect(mockRedis.sismember).toHaveBeenCalledWith(
        'venue:venue-1:users',
        'user-1',
      );
      expect(result).toBe(true);
    });

    it('should return false from isUserAtVenue when member does not exist', async () => {
      mockRedis.sismember.mockResolvedValue(0);

      const result = await redisService.isUserAtVenue('user-2', 'venue-1');

      expect(result).toBe(false);
    });

    it('should return only active users excluding specified userId from getActiveUsersAtVenue', async () => {
      // user-1 is active, user-2 is inactive, user-3 is the excluded user
      mockRedis.smembers.mockResolvedValue(['user-1', 'user-2', 'user-3']);
      mockRedis.get
        .mockResolvedValueOnce(Date.now().toString()) // user-1 heartbeat — active
        .mockResolvedValueOnce((Date.now() - 600_000).toString()); // user-2 heartbeat — inactive

      const result = await redisService.getActiveUsersAtVenue(
        'venue-1',
        'user-3',
      );

      expect(result).toEqual(['user-1']);
    });

    it('should return empty array from getActiveUsersAtVenue when no users are present', async () => {
      mockRedis.smembers.mockResolvedValue([]);

      const result = await redisService.getActiveUsersAtVenue(
        'venue-empty',
        'user-1',
      );

      expect(result).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Match Management
  // -----------------------------------------------------------------------
  describe('Match Management', () => {
    it('should add unread match to user set', async () => {
      await redisService.addUnreadMatch('user-1', 'chat-session-99');

      expect(mockRedis.sadd).toHaveBeenCalledWith(
        'user:user-1:matches:unread',
        'chat-session-99',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Statistics
  // -----------------------------------------------------------------------
  describe('Statistics', () => {
    it('should increment daily match counter and set expiry', async () => {
      await redisService.trackMatch('venue-1');

      const today = new Date().toISOString().split('T')[0]; // '2024-01-01'
      const expectedKey = `stats:venue:venue-1:matches:${today}`;

      expect(mockRedis.incr).toHaveBeenCalledWith(expectedKey);
      expect(mockRedis.expire).toHaveBeenCalledWith(
        expectedKey,
        REDIS_TTL.STATS_RETENTION,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Health
  // -----------------------------------------------------------------------
  describe('Health', () => {
    it('should return true when redis responds with PONG', async () => {
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await redisService.ping();

      expect(result).toBe(true);
    });

    it('should return false when redis responds with something other than PONG', async () => {
      mockRedis.ping.mockResolvedValue('');

      const result = await redisService.ping();

      expect(result).toBe(false);
    });

    it('should return false and log error when redis.ping throws', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Connection refused'));

      const result = await redisService.ping();

      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Rate Limiting — denied path
  // -----------------------------------------------------------------------
  describe('Rate Limiting — denied path', () => {
    it('should not set expiry on subsequent increments', async () => {
      // current count is 3 (not 1) so expire should not be called
      mockRedis.incr.mockResolvedValue(3);

      const result = await redisService.checkRateLimit('ip-2', 5, 60);

      expect(mockRedis.expire).not.toHaveBeenCalled();
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('should return allowed=false and remaining=0 when limit exceeded', async () => {
      mockRedis.incr.mockResolvedValue(10);

      const result = await redisService.checkRateLimit('ip-3', 5, 60);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });
});
