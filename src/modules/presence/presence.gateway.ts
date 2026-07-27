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

@WebSocketGateway({
  namespace: '/presence',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) ?? [
      'http://localhost:5173',
    ],
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

  handleDisconnect(client: Socket) {
    const socket = client as AuthenticatedSocket;

    try {
      this.presenceService.handleUserDisconnection(socket, this.server);
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

  notifyMatch(
    user1Id: string,
    user2Id: string,
    matchData: {
      chatSessionId: string;
      venueId: string;
      venueName: string;
      expiresAt: Date | null;
      user1: { id: string; firstName: string; lastName: string };
      user2: { id: string; firstName: string; lastName: string };
    },
  ): void {
    const basePayload = {
      chatSessionId: matchData.chatSessionId,
      venueId: matchData.venueId,
      venueName: matchData.venueName,
      expiresAt: matchData.expiresAt,
      message: 'You have a match!',
      timestamp: Date.now(),
    };

    this.server.to(`user:${user1Id}`).emit('match_found', {
      ...basePayload,
      partner: matchData.user2,
    });
    this.server.to(`user:${user2Id}`).emit('match_found', {
      ...basePayload,
      partner: matchData.user1,
    });

    this.logger.log(`Match notification sent to users ${user1Id} & ${user2Id}`);
  }
}
