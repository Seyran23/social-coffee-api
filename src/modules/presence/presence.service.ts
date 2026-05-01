import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Server } from 'socket.io';

import { AuthenticatedSocket } from '@/common/interfaces/websocket/authenticated-socket.interface';
import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { RECONNECTION_GRACE_PERIOD_MS } from '@/modules/presence/constants/reconnection-time';
import { WS_EVENTS } from '@/modules/presence/constants/ws-event-namings';
import { HeartbeatDto } from '@/modules/presence/dto/request/heartbeat.dto';
import { ProfileService } from '@/modules/profile/profile.service';
import { RedisService } from '@/modules/redis/redis.service';
import { isWithinDistance } from '@/modules/venue/utils/map-url.util';

@Injectable()
export class PresenceService implements OnModuleDestroy {
  private readonly userSocketMap = new Map<string, string>();
  private readonly disconnectionTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(
    private readonly redis: RedisService,
    private readonly profileService: ProfileService,
    private readonly logger: LoggerService,
    private readonly database: PrismaService,
  ) {
    this.logger.setContext(PresenceService.name);
  }

  onModuleDestroy(): void {
    // Clear any in-flight disconnection grace timers so they don't fire
    // after the module has been torn down (and don't leak in dev hot reloads).
    for (const timer of this.disconnectionTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectionTimers.clear();
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

  handleUserDisconnection(socket: AuthenticatedSocket, server: Server): void {
    const userId = socket.user.userId;
    const venueId = socket.venue?.id;

    if (!userId || !venueId) {
      this.logger.warn(`Missing userId or venueId during disconnection`);
      return;
    }

    this.logger.log(`User ${userId} disconnected from venue ${venueId}`);

    this.userSocketMap.delete(userId);

    this.startDisconnectionGracePeriod(userId, venueId, server);
  }

  async handleHeartbeat(
    socket: AuthenticatedSocket,
    payload?: HeartbeatDto,
  ): Promise<void> {
    const userId = socket.user.userId;
    const venueId = socket.venue?.id;

    if (!userId || !venueId) {
      this.logger.warn('Heartbeat received from unauthenticated socket');
      return;
    }

    await this.redis.updateHeartbeat(userId);

    // If the client included current coordinates, re-validate the geofence.
    // Frontend can choose how often to send coords (e.g. every 60s) — heartbeats
    // without coords skip the check, keeping the lookup cost bounded.
    if (payload?.latitude !== undefined && payload?.longitude !== undefined) {
      await this.checkGeofenceOrCheckOut(
        userId,
        venueId,
        payload.latitude,
        payload.longitude,
        socket,
      );
    }

    socket.emit(WS_EVENTS.HEARTBEAT_ACK, {
      timestamp: Date.now(),
    });
  }

  private async checkGeofenceOrCheckOut(
    userId: string,
    venueId: string,
    latitude: number,
    longitude: number,
    socket: AuthenticatedSocket,
  ): Promise<void> {
    const venue = await this.database.venue.findUnique({
      where: { id: venueId },
      select: { latitude: true, longitude: true, geofenceMeters: true },
    });

    if (!venue?.latitude || !venue?.longitude) {
      // Venue has no coordinates configured — can't validate.
      return;
    }

    const inside = isWithinDistance(
      { userLat: latitude, userLon: longitude },
      { venueLat: venue.latitude, venueLon: venue.longitude },
      venue.geofenceMeters,
    );

    if (!inside) {
      this.logger.log(
        `User ${userId} is outside venue ${venueId} geofence — auto-checking out`,
      );
      await this.redis.removeUserFromVenue(userId, venueId);
      socket.emit(WS_EVENTS.ERROR, {
        message: 'You have left the venue. You have been checked out.',
      });
      socket.disconnect();
    }
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

  private startDisconnectionGracePeriod(
    userId: string,
    venueId: string,
    server: Server,
  ): void {
    this.cancelDisconnectionTimer(userId);

    const timer = setTimeout(async () => {
      await this.handleGracePeriodExpired(userId, venueId, server);
    }, RECONNECTION_GRACE_PERIOD_MS);

    this.disconnectionTimers.set(userId, timer);

    this.logger.debug(
      `Started ${RECONNECTION_GRACE_PERIOD_MS}ms grace period for user ${userId}`,
    );
  }

  private async handleGracePeriodExpired(
    userId: string,
    venueId: string,
    server: Server,
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
        `User ${userId} grace period expired in venue ${venueId} — broadcasting user_left`,
      );
      this.notifyVenueUserLeft(userId, venueId, server);
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
