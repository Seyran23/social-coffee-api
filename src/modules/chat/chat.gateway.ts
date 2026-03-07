import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

import { AuthenticatedSocket } from '@/common/interfaces/websocket/authenticated-socket.interface';
import { LoggerService } from '@/common/logger/logger.service';
import { WsAuthMiddleware } from '@/common/middleware/websocket-auth.middleware';
import { WsRateLimitMiddleware } from '@/common/middleware/websocket-rate-limit.middleware';
import { ChatService } from '@/modules/chat/chat.service';
import { DEFAULT_MESSAGE_LIMIT } from '@/modules/chat/constants/default-message-limit';
import { CHAT_EVENTS } from '@/modules/chat/constants/events';
import { CHAT_MESSAGES } from '@/modules/chat/constants/messages';
import { EndChatDto } from '@/modules/chat/dto/request/end-chat.dto';
import { JoinChatDto } from '@/modules/chat/dto/request/join-chat.dto';
import { SendMessageDto } from '@/modules/chat/dto/request/send-message.dto';
import { TypingIndicatorDto } from '@/modules/chat/dto/request/typing-indicator.dto';
import { RedisService } from '@/modules/redis/redis.service';

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: 'http://localhost:5173',
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly logger: LoggerService,
    private readonly redis: RedisService,
    private readonly chatService: ChatService,
    private readonly wsAuthMiddleware: WsAuthMiddleware,
    private readonly wsRateLimitMiddleware: WsRateLimitMiddleware,
  ) {
    this.logger.setContext(ChatGateway.name);

    // Start expiry warning job
    this.startExpiryWarningJob();
  }

  // ========================================
  // GATEWAY INITIALIZATION
  // ========================================

  afterInit(server: Server): void {
    this.logger.log('Chat Gateway initialized');

    // Apply middlewares
    server.use(this.wsRateLimitMiddleware.useConnectionLimit());
    server.use(this.wsAuthMiddleware.use());

    // Cleanup job
    setInterval(() => {
      this.wsRateLimitMiddleware.cleanup();
    }, 60000);

    this.logger.log('Chat Gateway middlewares configured');
  }

  // ========================================
  // CONNECTION / DISCONNECTION
  // ========================================

  async handleConnection(client: AuthenticatedSocket) {
    const { userId, email } = client.user;

    this.logger.log(
      `User ${userId} (${email}) connected - Socket: ${client.id}`,
    );

    try {
      // Store socket mapping
      await this.redis.setUserSocket(userId, client.id);

      // Auto-join active chat if exists
      const wasAutoJoined = await this.handleAutoJoinChat(client, userId);

      // Only emit connection message if NOT auto-joined (to avoid duplicate emissions)
      if (!wasAutoJoined) {
        client.emit(CHAT_EVENTS.CHAT_JOINED, {
          userId,
          message: 'Connected to chat service',
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      this.logger.error(`Connection error for user ${userId}:`, error);
      this.emitError(client, 'Failed to establish connection');
    }
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    const { userId } = client.user;

    if (!userId) {
      return;
    }

    this.logger.log(`User ${userId} disconnected - Socket: ${client.id}`);

    try {
      await this.redis.deleteUserSocket(userId);
      await this.notifyPartnerDisconnect(userId);
    } catch (error) {
      this.logger.error(`Disconnect cleanup error for user ${userId}:`, error);
    }
  }

  // ========================================
  // CHAT EVENTS
  // ========================================

  /**
   * Join chat room
   */
  @SubscribeMessage(CHAT_EVENTS.JOIN_CHAT)
  async handleJoinChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: JoinChatDto,
  ): Promise<void> {
    const { userId } = client.user;
    const { chatSessionId } = data;

    try {
      // Validate participant
      await this.chatService.validateParticipant(chatSessionId, userId);

      // Join socket room
      client.join(`chat:${chatSessionId}`);

      // Get recent messages
      const [messages, session] = await Promise.all([
        this.chatService.getMessages(chatSessionId, userId, {
          limit: DEFAULT_MESSAGE_LIMIT,
        }),
        this.chatService.getChatSession(chatSessionId, userId),
      ]);

      client.emit(CHAT_EVENTS.CHAT_JOINED, {
        chatSessionId,
        messages,
        session,
        timestamp: Date.now(),
      });

      this.logger.log(`User ${userId} joined chat ${chatSessionId}`);
    } catch (error) {
      this.logger.error(`Error joining chat ${chatSessionId}:`, error);
      this.emitError(client, error.message ?? 'Failed to join chat');
    }
  }

  /**
   * Send message
   */
  @SubscribeMessage(CHAT_EVENTS.SEND_MESSAGE)
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: SendMessageDto,
  ): Promise<void> {
    const { userId } = client.user;
    const { chatSessionId, content } = data;

    if (!(await this.checkRateLimit(client, userId))) {
      return;
    }

    try {
      // Send message
      const message = await this.chatService.sendMessage({
        chatSessionId,
        senderId: userId,
        content,
      });

      // Emit to all participants in the chat room
      this.server.to(`chat:${chatSessionId}`).emit(CHAT_EVENTS.MESSAGE, {
        id: message.id,
        chatSessionId: message.chatSessionId,
        senderId: message.senderId,
        content: message.content,
        createdAt: message.createdAt,
      });

      this.logger.log(
        `Message sent in chat ${data.chatSessionId} by user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error sending message in chat ${chatSessionId}:`,
        error,
      );
      this.emitError(client, error.message ?? 'Failed to send message');
    }
  }

  /**
   * Typing indicator
   */
  @SubscribeMessage(CHAT_EVENTS.TYPING)
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: TypingIndicatorDto,
  ): Promise<void> {
    const { userId } = client.user;
    const { chatSessionId, isTyping } = data;

    try {
      // Validate participant
      await this.chatService.validateParticipant(chatSessionId, userId);

      // Broadcast to partner only (not sender)
      client.to(`chat:${chatSessionId}`).emit(CHAT_EVENTS.PARTNER_TYPING, {
        isTyping,
        userId,
      });
    } catch (error) {
      // Silent fail for typing indicator
      this.logger.debug('Typing indicator error:', error);
    }
  }

  /**
   * End chat
   */
  @SubscribeMessage(CHAT_EVENTS.END_CHAT)
  async handleEndChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: EndChatDto,
  ): Promise<void> {
    const { userId } = client.user;
    const { chatSessionId } = data;

    try {
      // End chat
      await this.chatService.endChat(chatSessionId, userId);

      // Notify all participants
      this.server.to(`chat:${chatSessionId}`).emit(CHAT_EVENTS.CHAT_ENDED, {
        chatSessionId,
        endedBy: userId,
        message: CHAT_MESSAGES.CHAT_ENDED,
        timestamp: Date.now(),
      });

      this.logger.log(`Chat ${chatSessionId} ended by user ${userId}`);
    } catch (error) {
      this.logger.error(`Error ending chat ${chatSessionId}:`, error);
      this.emitError(client, error.message ?? 'Failed to end chat');
    }
  }

  // ========================================
  // MATCH NOTIFICATION
  // ========================================

  /**
   * Notify both users of a mutual match via WebSocket
   */
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

    const basePayload = {
      chatSessionId: matchData.chatSessionId,
      venueId: matchData.venueId,
      venueName: matchData.venueName,
      expiresAt: matchData.expiresAt,
      timestamp: Date.now(),
    };

    if (user1Socket) {
      user1Socket.emit(CHAT_EVENTS.MATCH_FOUND, {
        ...basePayload,
        partner: matchData.user2,
      });
      this.logger.log(`Match notification sent to user ${user1Id}`);
    }

    if (user2Socket) {
      user2Socket.emit(CHAT_EVENTS.MATCH_FOUND, {
        ...basePayload,
        partner: matchData.user1,
      });
      this.logger.log(`Match notification sent to user ${user2Id}`);
    }
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  /**
   * Auto-join active chat on reconnection
   */
  private async handleAutoJoinChat(
    client: AuthenticatedSocket,
    userId: string,
  ): Promise<boolean> {
    const chatSessionId = await this.redis.getUserActiveChatSession(userId);

    if (!chatSessionId) {
      return false;
    }

    this.logger.log(`Auto-joining user ${userId} to chat ${chatSessionId}`);

    try {
      client.join(`chat:${chatSessionId}`);

      const [messages, session] = await Promise.all([
        this.chatService.getMessages(chatSessionId, userId, {
          limit: DEFAULT_MESSAGE_LIMIT,
        }),
        this.chatService.getChatSession(chatSessionId, userId),
      ]);

      client.emit(CHAT_EVENTS.CHAT_JOINED, {
        chatSessionId,
        messages,
        session,
        reconnected: true,
        timestamp: Date.now(),
      });

      return true;
    } catch (error) {
      this.logger.error(`Connection error for user ${userId}:`, error);
      this.emitError(client, 'Failed to establish connection');

      return false;
    }
  }

  /**
   * Notify partner when a user disconnects
   */
  private async notifyPartnerDisconnect(userId: string): Promise<void> {
    const chatSessionId = await this.redis.getUserActiveChatSession(userId);

    if (chatSessionId) {
      try {
        const partnerId = await this.chatService.getPartnerId(
          chatSessionId,
          userId,
        );
        const partnerSocket = await this.getUserSocket(partnerId);

        if (partnerSocket) {
          partnerSocket.emit(CHAT_EVENTS.PARTNER_LEFT, {
            message: CHAT_MESSAGES.PARTNER_LEFT,
            userId,
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        this.logger.debug('Error notifying partner disconnect:', error);
      }
    }
  }

  /**
   * Get user's socket by stored socket ID
   */
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

  /**
   * Start job to warn users about expiring chats
   */
  private startExpiryWarningJob(): void {
    setInterval(async () => {
      try {
        const expiringChats = await this.chatService.checkExpiringChats();

        for (const chat of expiringChats) {
          this.server
            .to(`chat:${chat.chatSessionId}`)
            .emit(CHAT_EVENTS.SESSION_ENDING_SOON, {
              chatSessionId: chat.chatSessionId,
              minutesLeft: chat.minutesLeft,
              message: `Your chat will expire in ${chat.minutesLeft} minute(s)`,
              timestamp: Date.now(),
            });

          this.logger.log(
            `Warning sent for chat ${chat.chatSessionId} - ${chat.minutesLeft} minutes left`,
          );
        }
      } catch (error) {
        this.logger.error('Error in expiry warning job:', error);
      }
    }, 60000); // Check every minute
  }

  private async checkRateLimit(
    client: AuthenticatedSocket,
    userId: string,
  ): Promise<boolean> {
    const allowed =
      await this.wsRateLimitMiddleware.checkEventRateLimit(userId);

    if (!allowed) {
      this.emitError(client, 'Rate limit exceeded. Please slow down!');
      return false;
    }

    return true;
  }

  private emitError(client: AuthenticatedSocket, message: string): void {
    client.emit(CHAT_EVENTS.ERROR, { message });
  }
}
