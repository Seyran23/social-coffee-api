import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

import { LoggerService } from '@/common/logger/logger.service';
import { UserProfile } from '@/modules/profile/types/user-profile.type';
import { REDIS_LIMITS } from '@/modules/redis/constants/limits';
import { REDIS_KEY_PREFIX } from '@/modules/redis/constants/prefixes';
import { REDIS_TTL } from '@/modules/redis/constants/time-to-live';

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly logger: LoggerService,
  ) {}

  async onModuleDestroy() {
    await this.redis.quit();
  }

  // HEARTBEAT / ACTIVITY TRACKING

  async updateHeartbeat(userId: string): Promise<void> {
    const key = this.getHeartbeatKey(userId);
    await this.redis.setex(key, REDIS_TTL.HEARTBEAT, Date.now().toString());
  }

  async getLastHeartbeat(userId: string): Promise<number | null> {
    const key = this.getHeartbeatKey(userId);
    const timestamp = await this.redis.get(key);
    return timestamp ? parseInt(timestamp) : null;
  }

  async isUserActive(userId: string): Promise<boolean> {
    const lastHeartbeat = await this.getLastHeartbeat(userId);
    if (!lastHeartbeat) {
      return false;
    }

    const now = Date.now();
    const diff = now - lastHeartbeat;
    return diff < REDIS_TTL.HEARTBEAT_ACTIVE_THRESHOLD;
  }

  // CHAT SESSION MANAGEMENT

  // In RedisService
  async setChatSession(
    chatSessionId: string,
    data: {
      id: string;
      user1Id: string;
      user2Id: string;
      venueId: string;
      status: string;
      startedAt: number;
      expiresAt: number;

      user1?: { id: string; firstName: string; lastName: string };
      user2?: { id: string; firstName: string; lastName: string };
      venue?: { id: string; name: string };
    },
  ): Promise<void> {
    const key = this.getChatSessionKey(chatSessionId);
    await this.redis.setex(key, REDIS_TTL.CHAT_SESSION, JSON.stringify(data));

    await this.redis.setex(
      this.getUserChatKey(data.user1Id),
      REDIS_TTL.CHAT_SESSION,
      chatSessionId,
    );
    await this.redis.setex(
      this.getUserChatKey(data.user2Id),
      REDIS_TTL.CHAT_SESSION,
      chatSessionId,
    );
  }

  async getChatSession(chatSessionId: string): Promise<any | null> {
    const key = this.getChatSessionKey(chatSessionId);
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async getUserActiveChatSession(userId: string): Promise<string | null> {
    const key = this.getUserChatKey(userId);
    const userActiveChatSession = await this.redis.get(key);
    return userActiveChatSession;
  }

  async deleteChatSession(
    chatSessionId: string,
    user1Id: string,
    user2Id: string,
  ): Promise<void> {
    await this.redis.del(
      this.getChatSessionKey(chatSessionId),
      this.getUserChatKey(user1Id),
      this.getUserChatKey(user2Id),
    );
  }

  async cacheMessage(
    chatSessionId: string,
    message: {
      id: string;
      senderId: string;
      content: string;
      timestamp: number;
    },
  ): Promise<void> {
    const key = this.getChatMessagesKey(chatSessionId);

    await this.redis.lpush(key, JSON.stringify(message));

    await this.redis.ltrim(key, 0, REDIS_LIMITS.MAX_CACHED_MESSAGES - 1);

    await this.redis.expire(key, REDIS_TTL.CHAT_MESSAGES_CACHE);
  }

  async getCachedMessages(chatSessionId: string, limit = 50): Promise<any[]> {
    const key = this.getChatMessagesKey(chatSessionId);
    const messages = await this.redis.lrange(key, 0, limit - 1);
    return messages.map(msg => JSON.parse(msg)).reverse();
  }

  // SOCKET MAPPING

  async setUserSocket(userId: string, socketId: string): Promise<void> {
    await this.redis.setex(
      this.getUserSocketKey(userId),
      REDIS_TTL.SOCKET_MAPPING,
      socketId,
    );
    await this.redis.setex(
      `socket:${socketId}`,
      REDIS_TTL.SOCKET_MAPPING,
      userId,
    );
  }

  async getUserSocket(userId: string): Promise<string | null> {
    const key = this.getUserSocketKey(userId);
    const userSocketId = await this.redis.get(key);
    return userSocketId;
  }

  async getUserIdFromSocket(socketId: string): Promise<string | null> {
    const userId = await this.redis.get(`socket:${socketId}`);
    return userId;
  }

  async deleteUserSocket(userId: string): Promise<void> {
    const socketId = await this.getUserSocket(userId);
    if (socketId) {
      await this.redis.del(this.getUserSocketKey(userId));
      await this.redis.del(`socket:${socketId}`);
    }
  }

  // RATE LIMITING

  async checkRateLimit(
    identifier: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const key = `ratelimit:${identifier}`;

    const current = await this.redis.incr(key);

    if (current === 1) {
      await this.redis.expire(key, windowSeconds);
    }

    const allowed = current <= limit;
    const remaining = Math.max(0, limit - current);

    return { allowed, remaining };
  }

  // VENUE PRESENCE TRACKING

  async addUserToVenue(userId: string, venueId: string): Promise<void> {
    await this.redis.sadd(`venue:${venueId}:users`, userId);
    await this.redis.sadd('active_venues', venueId);
    await this.redis.setex(
      `user:${userId}:venue`,
      REDIS_TTL.VENUE_PRESENCE,
      venueId,
    );
  }

  async removeUserFromVenue(userId: string, venueId: string): Promise<void> {
    await this.redis.srem(`venue:${venueId}:users`, userId);
    await this.redis.del(`user:${userId}:venue`);

    const remaining = await this.redis.scard(`venue:${venueId}:users`);
    if (remaining === 0) {
      await this.redis.srem('active_venues', venueId);
    }
  }

  async getActiveVenueIds(): Promise<string[]> {
    return this.redis.smembers('active_venues');
  }

  async getUsersAtVenue(venueId: string): Promise<string[]> {
    const users = await this.redis.smembers(`venue:${venueId}:users`);
    return users;
  }

  async getVenueUserCount(venueId: string): Promise<number> {
    const venueUserCount = await this.redis.scard(`venue:${venueId}:users`);
    return venueUserCount;
  }

  async getUserCurrentVenue(userId: string): Promise<string | null> {
    const userCurrentVenue = await this.redis.get(`user:${userId}:venue`);
    return userCurrentVenue;
  }

  async isUserAtVenue(userId: string, venueId: string): Promise<boolean> {
    return (await this.redis.sismember(`venue:${venueId}:users`, userId)) === 1;
  }

  async getActiveUsersAtVenue(
    venueId: string,
    excludeUserId: string,
  ): Promise<string[]> {
    const allUsers = await this.getUsersAtVenue(venueId);

    const results = await Promise.all(
      allUsers
        .filter(id => id !== excludeUserId)
        .map(async id => ({ id, active: await this.isUserActive(id) })),
    );

    return results.filter(u => u.active).map(u => u.id);
  }

  // MATCH MANAGEMENT

  async addUnreadMatch(userId: string, chatSessionId: string): Promise<void> {
    await this.redis.sadd(`user:${userId}:matches:unread`, chatSessionId);
  }

  async removeUnreadMatch(
    userId: string,
    chatSessionId: string,
  ): Promise<void> {
    await this.redis.srem(`user:${userId}:matches:unread`, chatSessionId);
  }

  async getUnreadMatches(userId: string): Promise<string[]> {
    const userUnreadMatches = await this.redis.smembers(
      `user:${userId}:matches:unread`,
    );
    return userUnreadMatches;
  }

  async getUnreadMatchCount(userId: string): Promise<number> {
    const userUnreadMatchesCount = await this.redis.scard(
      `user:${userId}:matches:unread`,
    );
    return userUnreadMatchesCount;
  }

  // PROFILE CACHING

  async cacheProfile(userId: string, profile: UserProfile): Promise<void> {
    await this.redis.setex(
      `profile:${userId}`,
      REDIS_TTL.PROFILE_CACHE,
      JSON.stringify(profile),
    );
  }

  async getCachedProfile(userId: string): Promise<UserProfile | null> {
    const data = await this.redis.get(`profile:${userId}`);
    return data ? JSON.parse(data) : null;
  }

  async invalidateProfile(userId: string): Promise<void> {
    await this.redis.del(`profile:${userId}`);
  }

  // QR CODE MANAGEMENT

  async storeQRToken(
    venueId: string,
    token: string,
    ttl: number,
  ): Promise<void> {
    await this.redis.setex(`qr:${venueId}:${token}`, ttl, venueId);
  }

  async validateAndConsumeQR(venueId: string, token: string): Promise<boolean> {
    const stored = await this.redis.get(`qr:${venueId}:${token}`);
    if (stored) {
      await this.redis.del(`qr:${venueId}:${token}`);
      return true;
    }
    return false;
  }

  // TYPING INDICATORS

  async setTyping(chatSessionId: string, userId: string): Promise<void> {
    await this.redis.setex(
      `typing:${chatSessionId}:${userId}`,
      REDIS_TTL.TYPING_INDICATOR,
      'true',
    );
  }

  async isTyping(chatSessionId: string, userId: string): Promise<boolean> {
    return !!(await this.redis.get(`typing:${chatSessionId}:${userId}`));
  }

  // STATISTICS & ANALYTICS

  async incrementVenueVisits(venueId: string, date: string): Promise<void> {
    const key = `stats:venue:${venueId}:visits:${date}`;
    await this.redis.incr(key);
    await this.redis.expire(key, REDIS_TTL.STATS_RETENTION);
  }

  async getVenueVisits(venueId: string, date: string): Promise<number> {
    const key = `stats:venue:${venueId}:visits:${date}`;
    const count = await this.redis.get(key);
    return count ? parseInt(count) : 0;
  }

  async trackMatch(venueId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const key = `stats:venue:${venueId}:matches:${today}`;
    await this.redis.incr(key);
    await this.redis.expire(key, REDIS_TTL.STATS_RETENTION);
  }

  async incrementVenueStats(
    venueId: string,
    field: string,
    increment = 1,
  ): Promise<void> {
    await this.redis.hincrby(`venue:${venueId}:stats`, field, increment);
  }

  async getVenueStats(venueId: string): Promise<Record<string, string>> {
    const venueStatistics = await this.redis.hgetall(`venue:${venueId}:stats`);
    return venueStatistics;
  }

  // CACHE OPERATIONS

  async cacheSet(
    key: string,
    value: any,
    ttlSeconds: number = REDIS_TTL.DEFAULT_CACHE,
  ): Promise<void> {
    await this.redis.setex(`cache:${key}`, ttlSeconds, JSON.stringify(value));
  }

  async cacheGet<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(`cache:${key}`);
    return data ? JSON.parse(data) : null;
  }

  async cacheDelete(key: string): Promise<void> {
    await this.redis.del(`cache:${key}`);
  }

  async cacheInvalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(`cache:${pattern}`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  // HELPER METHODS

  private getHeartbeatKey(userId: string): string {
    return `${REDIS_KEY_PREFIX.HEARTBEAT}:${userId}`;
  }

  private getChatSessionKey(chatSessionId: string): string {
    return `${REDIS_KEY_PREFIX.CHAT_SESSION}:${chatSessionId}`;
  }

  private getUserChatKey(userId: string): string {
    return `${REDIS_KEY_PREFIX.CHAT_USER}:${userId}`;
  }

  private getChatMessagesKey(chatSessionId: string): string {
    return `${REDIS_KEY_PREFIX.CHAT_MESSAGES}:${chatSessionId}`;
  }

  private getUserSocketKey(userId: string): string {
    return `${REDIS_KEY_PREFIX.SOCKET_USER}:${userId}`;
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      this.logger.error('Redis ping failed', error);
      return false;
    }
  }

  async getInfo(): Promise<any> {
    const info = await this.redis.info();
    return info;
  }
}
