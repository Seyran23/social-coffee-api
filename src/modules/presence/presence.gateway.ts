import { Injectable } from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { AuthenticatedSocket } from '@/common/interfaces/websocket/authenticated-socket.interface';
import { LoggerService } from '@/common/logger/logger.service';
import { WsAuthMiddleware } from '@/common/middleware/websocket-auth.middleware';
import { WsRateLimitMiddleware } from '@/common/middleware/websocket-rate-limit.middleware';
import { PresenceService } from '@/modules/presence/presence.service';
import { RedisService } from '@/modules/redis/redis.service';

@WebSocketGateway({
  namespace: '/presence',
  cors: {
    origin: 'http://localhost:5173',
    credentials: true,
  },
})
@Injectable()
export class PresenceGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly presenceService: PresenceService,
    private readonly wsAuthMiddleware: WsAuthMiddleware,
    private readonly wsRateLimitMiddleware: WsRateLimitMiddleware,
    private readonly logger: LoggerService,
    private readonly redis: RedisService,
  ) {
    this.logger.setContext(PresenceGateway.name);
  }

  afterInit(server: Server) {
    server.use(this.wsAuthMiddleware.use());
    server.use(this.wsRateLimitMiddleware.useConnectionLimit());

    setInterval(() => {
      this.wsRateLimitMiddleware.cleanup();
    }, 60000);
  }

  async handleConnection(client: Socket) {
    const socket = client as AuthenticatedSocket;

    try {
      await this.presenceService.handleUserConnection(socket);
    } catch (error) {
      this.logger.error(`Connection failed:`, error.message);
      socket.emit('error', { message: 'Connection failed' });
      socket.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const socket = client as AuthenticatedSocket;

    try {
      await this.presenceService.handleUserDisconnection(socket);
    } catch (error) {
      this.logger.error(`Disconnection handling failed:`, error.message);
    }
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    const socket = client as AuthenticatedSocket;
    await this.presenceService.handleHeartbeat(socket);
  }

  async broadcastUserJoined(userId: string, venueId: string): Promise<void> {
    await this.presenceService.broadcastUserJoined(
      userId,
      venueId,
      this.server,
    );
  }

  async broadcastUserLeft(userId: string, venueId: string): Promise<void> {
    await this.presenceService.broadcastUserLeft(userId, venueId, this.server);
  }

  // In PresenceGateway
  async notifyMatch(
    user1Id: string,
    user2Id: string,
    matchData: {
      chatSessionId: string;
      venueId: string;
      venueName: string;
      expiresAt: Date;
      user1: { id: string; firstName: string; lastName: string };
      user2: { id: string; firstName: string; lastName: string };
    },
  ): Promise<void> {
    const [user1Socket, user2Socket] = await Promise.all([
      this.getUserSocket(user1Id),
      this.getUserSocket(user2Id),
    ]);

    console.log('user1Socket', user1Socket);
    console.log('user2Socket', user2Socket);

    const basePayload = {
      chatSessionId: matchData.chatSessionId,
      venueId: matchData.venueId,
      venueName: matchData.venueName,
      expiresAt: matchData.expiresAt,
      timestamp: Date.now(),
    };

    console.log('basePayload', basePayload);

    if (user1Socket) {
      user1Socket.emit('match_found', {
        // Use 'match.found' to match client
        ...basePayload,
        partner: matchData.user2,
      });
      this.logger.log(`Match notification sent to user ${user1Id}`);
    }

    if (user2Socket) {
      user2Socket.emit('match_found', {
        // Use 'match.found' to match client
        ...basePayload,
        partner: matchData.user1,
      });
      this.logger.log(`Match notification sent to user ${user2Id}`);
    }
  }

  private async getUserSocket(
    userId: string,
  ): Promise<AuthenticatedSocket | null> {
    const socketId = await this.redis.getUserSocket(userId);
    if (!socketId) {
      return null;
    }

    // Get socket directly by ID
    const socket = this.server.sockets.sockets.get(socketId);

    if (!socket) {
      // Socket disconnected, clean up Redis
      await this.redis.deleteUserSocket(userId);
      return null;
    }

    return socket as AuthenticatedSocket;
  }
}
