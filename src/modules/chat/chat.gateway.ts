import { Interval } from '@nestjs/schedule';
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
    origin: process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) ?? [
      'http://localhost:5173',
    ],
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
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
  }

  afterInit(server: Server): void {
    this.logger.log('Chat Gateway initialized');

    server.use(this.wsRateLimitMiddleware.useConnectionLimit());
    server.use(this.wsAuthMiddleware.use());

    this.logger.log('Chat Gateway middlewares configured');
  }

  @Interval('ws-rate-limit-cleanup', 60_000)
  cleanupRateLimits(): void {
    this.wsRateLimitMiddleware.cleanup();
  }

  async handleConnection(client: AuthenticatedSocket) {
    const { userId, email } = client.user;

    this.logger.log(
      `User ${userId} (${email}) connected - Socket: ${client.id}`,
    );

    try {
      await this.redis.setUserSocket(userId, client.id);

      const wasAutoJoined = await this.handleAutoJoinChat(client, userId);

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
      await this.chatService.validateParticipant(chatSessionId, userId);

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
      const message = await this.chatService.sendMessage({
        chatSessionId,
        senderId: userId,
        content,
      });

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
      await this.chatService.validateParticipant(chatSessionId, userId);

      client.to(`chat:${chatSessionId}`).emit(CHAT_EVENTS.PARTNER_TYPING, {
        isTyping,
        userId,
      });
    } catch (error) {
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

    const socket = this.server.sockets.sockets.get(socketId);

    if (!socket) {
      await this.redis.deleteUserSocket(userId);
      return null;
    }

    return socket as AuthenticatedSocket;
  }

  /**
   * Warn users when their chat is about to expire (runs every minute).
   */
  @Interval('chat-expiry-warning', 60_000)
  async runExpiryWarningJob(): Promise<void> {
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
