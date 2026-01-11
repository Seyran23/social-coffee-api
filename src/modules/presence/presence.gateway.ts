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
}
