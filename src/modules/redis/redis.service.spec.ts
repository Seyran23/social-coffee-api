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
  });
});
