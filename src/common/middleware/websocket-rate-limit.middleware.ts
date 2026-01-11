import { Inject, Injectable, Optional } from '@nestjs/common';
import { Socket } from 'socket.io';

import { RateLimitConfig } from '@/common/interfaces/websocket/rate-limit-config.interface';
import { LoggerService } from '@/common/logger/logger.service';
import { RedisService } from '@/modules/redis/redis.service';

@Injectable()
export class WsRateLimitMiddleware {
  private readonly config: Required<RateLimitConfig>;
  private connectionAttempts = new Map<string, number[]>();

  private static readonly DEFAULT_CONFIG: Required<RateLimitConfig> = {
    maxConnections: 10,
    windowMs: 60000, // 1 minute
    maxEventsPerMinute: 100,
  };

  constructor(
    private readonly redis: RedisService,
    private readonly logger: LoggerService,
    @Optional() @Inject('RATE_LIMIT_CONFIG') config?: Partial<RateLimitConfig>,
  ) {
    this.logger.setContext(WsRateLimitMiddleware.name);

    this.config = {
      ...WsRateLimitMiddleware.DEFAULT_CONFIG,
      ...config,
    };
  }

  useConnectionLimit() {
    return (socket: Socket, next: (err?: Error) => void) => {
      const identifier = this.getIdentifier(socket);
      const now = Date.now();

      if (!this.connectionAttempts.has(identifier)) {
        this.connectionAttempts.set(identifier, []);
      }

      const attempts = this.connectionAttempts.get(identifier)!;

      const recentAttempts = attempts.filter(
        timestamp => now - timestamp < this.config.windowMs,
      );

      this.connectionAttempts.set(identifier, recentAttempts);

      if (recentAttempts.length >= this.config.maxConnections) {
        this.logger.warn(
          `Rate limit exceeded for ${identifier} (${recentAttempts.length} connections in ${this.config.windowMs}ms)`,
        );

        return next(
          new Error(
            `Too many connection attempts. Please try again in ${Math.ceil(this.config.windowMs / 1000)} seconds.`,
          ),
        );
      }

      recentAttempts.push(now);
      this.connectionAttempts.set(identifier, recentAttempts);

      this.logger.debug(
        `Connection attempt ${recentAttempts.length}/${this.config.maxConnections} for ${identifier}`,
      );

      next();
    };
  }

  async checkEventRateLimit(userId: string): Promise<boolean> {
    const { allowed, remaining } = await this.redis.checkRateLimit(
      `ws:events:${userId}`,
      this.config.maxEventsPerMinute,
      60, // 60 seconds
    );

    if (!allowed) {
      this.logger.warn(
        `Event rate limit exceeded for user ${userId} (max: ${this.config.maxEventsPerMinute}/min)`,
      );
    }

    return allowed;
  }

  private getIdentifier(socket: Socket): string {
    return socket.data?.userId ?? socket.handshake.address;
  }

  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [identifier, attempts] of this.connectionAttempts.entries()) {
      const recentAttempts = attempts.filter(
        timestamp => now - timestamp < this.config.windowMs,
      );

      if (recentAttempts.length === 0) {
        this.connectionAttempts.delete(identifier);
        cleaned++;
      } else {
        this.connectionAttempts.set(identifier, recentAttempts);
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} rate limit entries`);
    }
  }
  z;
}
