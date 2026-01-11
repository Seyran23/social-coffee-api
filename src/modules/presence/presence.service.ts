import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

import { AuthenticatedSocket } from '@/common/interfaces/websocket/authenticated-socket.interface';
import { LoggerService } from '@/common/logger/logger.service';
import { RECONNECTION_GRACE_PERIOD_MS } from '@/modules/presence/constants/reconnection-time';
import { WS_EVENTS } from '@/modules/presence/constants/ws-event-namings';
import { ProfileService } from '@/modules/profile/profile.service';
import { RedisService } from '@/modules/redis/redis.service';

@Injectable()
export class PresenceService {
  private readonly userSocketMap = new Map<string, string>();
  private readonly disconnectionTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly redis: RedisService,
    private readonly profileService: ProfileService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(PresenceService.name);
  }

  async handleUserConnection(socket: AuthenticatedSocket): Promise<void> {
    const userId = socket.user.userId;

    const venueId = await this.verifyUserCheckIn(userId, socket);
    if (!venueId) {
      return;
    }

    this.setupSocketForUser(userId, venueId, socket);

    this.cancelDisconnectionTimer(userId);

    await this.redis.updateHeartbeat(userId);

    await this.sendInitialFeed(userId, socket);

    await this.notifyVenueUserJoined(userId, venueId, socket);

    this.logger.log(`✓ User ${userId} connected to venue ${venueId}`);
  }

  handleUserDisconnection(socket: AuthenticatedSocket): void {
    const userId = socket.user.userId;
    const venueId = socket.venue?.id;

    if (!userId || !venueId) {
      this.logger.warn(`Missing userId or venueId during disconnection`);
      return;
    }

    this.logger.log(`User ${userId} disconnected from venue ${venueId}`);

    this.userSocketMap.delete(userId);

    this.startDisconnectionGracePeriod(userId, venueId);
  }

  async handleHeartbeat(socket: AuthenticatedSocket): Promise<void> {
    const userId = socket.user.userId;
    const venueId = socket.venue?.id;

    if (!userId || !venueId) {
      this.logger.warn('Heartbeat received from unauthenticated socket');
      return;
    }

    await this.redis.updateHeartbeat(userId);

    socket.emit(WS_EVENTS.HEARTBEAT_ACK, {
      timestamp: Date.now(),
    });
  }

  async broadcastUserJoined(
    userId: string,
    venueId: string,
    server: Server,
  ): Promise<void> {
    await this.notifyVenueUserJoined(userId, venueId, undefined, server);
  }

  async broadcastUserLeft(
    userId: string,
    venueId: string,
    server: Server,
  ): Promise<void> {
    await this.notifyVenueUserLeft(userId, venueId, server);
  }

  private async verifyUserCheckIn(
    userId: string,
    socket: AuthenticatedSocket,
  ): Promise<string | null> {
    const venueId = await this.redis.getUserCurrentVenue(userId);

    if (!venueId) {
      this.logger.warn(`User ${userId} not checked in to any venue`);

      socket.emit(WS_EVENTS.ERROR, {
        message: 'Not checked in. Please check in first.',
      });

      socket.disconnect();
      return null;
    }

    socket.venue = { id: venueId };
    return venueId;
  }

  private setupSocketForUser(
    userId: string,
    venueId: string,
    socket: AuthenticatedSocket,
  ): void {
    this.userSocketMap.set(userId, socket.id);

    socket.join(`venue:${venueId}`);

    this.logger.debug(
      `Socket ${socket.id} mapped to user ${userId} in venue ${venueId}`,
    );
  }

  private cancelDisconnectionTimer(userId: string): void {
    const existingTimer = this.disconnectionTimers.get(userId);

    if (existingTimer) {
      clearTimeout(existingTimer);
      this.disconnectionTimers.delete(userId);
      this.logger.debug(`Cancelled disconnection timer for user ${userId}`);
    }
  }

  private startDisconnectionGracePeriod(userId: string, venueId: string): void {
    this.cancelDisconnectionTimer(userId);

    const timer = setTimeout(async () => {
      await this.handleGracePeriodExpired(userId, venueId);
    }, RECONNECTION_GRACE_PERIOD_MS);

    this.disconnectionTimers.set(userId, timer);

    this.logger.debug(
      `Started ${RECONNECTION_GRACE_PERIOD_MS}ms grace period for user ${userId}`,
    );
  }

  private async handleGracePeriodExpired(
    userId: string,
    venueId: string,
  ): Promise<void> {
    const isReconnected = this.userSocketMap.has(userId);

    if (isReconnected) {
      this.logger.debug(`User ${userId} reconnected during grace period`);
      this.disconnectionTimers.delete(userId);
      return;
    }

    const currentVenue = await this.redis.getUserCurrentVenue(userId);

    if (currentVenue === venueId) {
      this.logger.log(
        `User ${userId} grace period expired in venue ${venueId}`,
      );
    } else {
      this.logger.debug(
        `User ${userId} already checked out via HTTP, no broadcast needed`,
      );
    }

    this.disconnectionTimers.delete(userId);
  }

  private async sendInitialFeed(
    userId: string,
    socket: AuthenticatedSocket,
  ): Promise<void> {
    try {
      const compatibleUsers =
        await this.profileService.discoverProfiles(userId);

      socket.emit(WS_EVENTS.FEED_INITIAL, {
        users: compatibleUsers,
        timestamp: Date.now(),
      });

      this.logger.debug(`Sent initial feed to user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to send initial feed to user ${userId}`,
        error.stack,
      );

      socket.emit(WS_EVENTS.ERROR, {
        message: 'Failed to load initial feed',
      });
    }
  }

  private async notifyVenueUserJoined(
    userId: string,
    venueId: string,
    socket?: AuthenticatedSocket,
    server?: Server,
  ): Promise<void> {
    try {
      const userProfile = await this.profileService.getUserProfile(userId);

      if (socket) {
        socket.to(`venue:${venueId}`).emit(WS_EVENTS.USER_JOINED, {
          user: userProfile,
          timestamp: Date.now(),
        });
        this.logger.debug(
          `Notified venue ${venueId} of user ${userId} joining (excluded self)`,
        );
      } else if (server) {
        server.to(`venue:${venueId}`).emit(WS_EVENTS.USER_JOINED, {
          user: userProfile,
          timestamp: Date.now(),
        });
        this.logger.debug(
          `Notified venue ${venueId} of user ${userId} joining (all users)`,
        );
      } else {
        this.logger.warn(
          `Cannot notify user_joined: neither socket nor server provided`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to broadcast user_joined for ${userId}`,
        error.stack,
      );
    }
  }

  private notifyVenueUserLeft(
    userId: string,
    venueId: string,
    server: Server,
  ): void {
    server.to(`venue:${venueId}`).emit(WS_EVENTS.USER_LEFT, {
      userId,
      timestamp: Date.now(),
    });

    this.logger.debug(`Notified venue ${venueId} of user ${userId} leaving`);
  }
}
