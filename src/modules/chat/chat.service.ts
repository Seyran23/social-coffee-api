import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatSessionStatus } from '@prisma/client';

import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { DEFAULT_MESSAGE_LIMIT } from '@/modules/chat/constants/default-message-limit';
import { CHAT_MESSAGES } from '@/modules/chat/constants/messages';
import { ChatSessionResponseDto } from '@/modules/chat/dto/response/chat-session-response.dto';
import { MessageResponseDto } from '@/modules/chat/dto/response/message-response.dto';
import { MessagesOptions } from '@/modules/chat/interfaces/message-options.interface';
import { RedisService } from '@/modules/redis/redis.service';

export interface ChatSessionWithRelations {
  id: string;
  venueId: string;
  user1Id: string | null;
  user2Id: string | null;
  status: ChatSessionStatus;
  startedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user1: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  user2: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  venue: {
    id: string;
    name: string;
  };
}

@Injectable()
export class ChatService {
  constructor(
    private readonly database: PrismaService,
    private readonly redis: RedisService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(ChatService.name);

    this.startExpiredChatCleanup();
  }

  async getChatSession(
    chatSessionId: string,
    userId: string,
  ): Promise<ChatSessionResponseDto> {
    const cached = await this.redis.getChatSession(chatSessionId);

    if (cached) {
      this.validateUserIsParticipant(cached, userId);
      return this.mapToSessionResponse(cached, userId);
    }

    const session = await this.fetchChatSessionFromDatabase(chatSessionId);

    if (!session) {
      throw new NotFoundException(CHAT_MESSAGES.CHAT_NOT_FOUND);
    }

    this.validateUserIsParticipant(session, userId);

    console.log('session from db getChatSession: ', session);

    // ✅ CACHE WITH ALL DATA
    if (session.user1Id && session.user2Id) {
      await this.redis.setChatSession(chatSessionId, {
        id: session.id,
        user1Id: session.user1Id,
        user2Id: session.user2Id,
        venueId: session.venueId,
        status: session.status,
        startedAt: session.startedAt?.getTime() ?? Date.now(),
        expiresAt: session.expiresAt?.getTime() ?? Date.now(),
        user1: session.user1
          ? {
              id: session.user1.id,
              firstName: session.user1.firstName ?? '',
              lastName: session.user1.lastName ?? '',
            }
          : undefined,
        user2: session.user2
          ? {
              id: session.user2.id,
              firstName: session.user2.firstName ?? '',
              lastName: session.user2.lastName ?? '',
            }
          : undefined,
        venue: session.venue,
      });
    }

    return this.mapToSessionResponse(session, userId);
  }

  // Add this to your ChatService

  /**
   * Get user's active chat sessions (matches)
   */
  async getMyChatSessions(
    userId: string,
    venueId?: string,
  ): Promise<ChatSessionResponseDto[]> {
    const where: any = {
      status: ChatSessionStatus.ACTIVE,
      OR: [{ user1Id: userId }, { user2Id: userId }],
    };

    if (venueId) {
      where.venueId = venueId;
    }

    const sessions = await this.database.chatSession.findMany({
      where,
      include: {
        user1: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        user2: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        venue: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return sessions.map(session => this.mapToSessionResponse(session, userId));
  }

  async validateParticipant(
    chatSessionId: string,
    userId: string,
  ): Promise<void> {
    const cached = await this.redis.getChatSession(chatSessionId);

    if (cached) {
      if (cached.user1Id !== userId && cached.user2Id !== userId) {
        throw new ForbiddenException(CHAT_MESSAGES.NOT_PARTICIPANT);
      }
      return;
    }

    const session = await this.database.chatSession.findFirst({
      where: {
        id: chatSessionId,
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
    });

    if (!session) {
      throw new ForbiddenException(CHAT_MESSAGES.NOT_PARTICIPANT);
    }
  }

  async getPartnerId(chatSessionId: string, userId: string): Promise<string> {
    const cached = await this.redis.getChatSession(chatSessionId);

    if (cached) {
      return cached.user1Id === userId ? cached.user2Id : cached.user1Id;
    }

    const session = await this.database.chatSession.findUnique({
      where: { id: chatSessionId },
      select: {
        user1Id: true,
        user2Id: true,
      },
    });

    console.log('session from db getPartnerId: ', session);

    if (!session) {
      throw new NotFoundException(CHAT_MESSAGES.CHAT_NOT_FOUND);
    }

    if (session.user1Id === userId) {
      if (!session.user2Id) {
        throw new NotFoundException('Partner not found');
      }
      return session.user2Id;
    }

    if (session.user2Id === userId) {
      if (!session.user1Id) {
        throw new NotFoundException('Partner not found');
      }
      return session.user1Id;
    }

    throw new ForbiddenException(CHAT_MESSAGES.NOT_PARTICIPANT);
  }

  async sendMessage(data: {
    chatSessionId: string;
    senderId: string;
    content: string;
  }): Promise<MessageResponseDto> {
    const { chatSessionId, senderId, content } = data;

    await this.validateParticipant(chatSessionId, senderId);

    const session = await this.database.chatSession.findUnique({
      where: { id: chatSessionId },
    });

    console.log('session from db sendMessage: ', session);

    if (!session) {
      throw new NotFoundException(CHAT_MESSAGES.CHAT_NOT_FOUND);
    }

    if (session.status !== ChatSessionStatus.ACTIVE) {
      throw new BadRequestException(CHAT_MESSAGES.CHAT_ALREADY_ENDED);
    }

    if (session.expiresAt && new Date() > session.expiresAt) {
      throw new BadRequestException(CHAT_MESSAGES.CHAT_EXPIRED);
    }

    const message = await this.database.message.create({
      data: {
        chatSessionId,
        senderId,
        content,
      },
    });

    await this.redis.cacheMessage(chatSessionId, {
      id: message.id,
      senderId: message.senderId,
      content: message.content,
      timestamp: message.createdAt.getTime(),
    });

    this.logger.log(
      `Message sent in chat ${chatSessionId} by user ${senderId}`,
    );

    return message;
  }

  async getMessages(
    chatSessionId: string,
    userId: string,
    options: MessagesOptions = {},
  ): Promise<MessageResponseDto[]> {
    await this.validateParticipant(chatSessionId, userId);

    const limit = options.limit ?? DEFAULT_MESSAGE_LIMIT;

    if (!options.before) {
      const cachedMessages = await this.getCachedMessages(chatSessionId, limit);

      if (cachedMessages.length > 0) {
        return cachedMessages;
      }
    }

    return this.fetchMessagesFromDatabase(chatSessionId, options);
  }

  async endChat(chatSessionId: string, userId: string): Promise<void> {
    await this.validateParticipant(chatSessionId, userId);

    const session = await this.database.chatSession.findUnique({
      where: { id: chatSessionId },
      select: {
        id: true,
        status: true,
        user1Id: true,
        user2Id: true,
      },
    });

    if (!session) {
      throw new NotFoundException(CHAT_MESSAGES.CHAT_NOT_FOUND);
    }

    if (session.status !== ChatSessionStatus.ACTIVE) {
      throw new BadRequestException(CHAT_MESSAGES.CHAT_ALREADY_ENDED);
    }

    await this.database.chatSession.update({
      where: { id: chatSessionId },
      data: {
        status: ChatSessionStatus.ENDED,
      },
    });

    const user1Id = session.user1Id;
    const user2Id = session.user2Id;

    await this.redis.deleteChatSession(chatSessionId, user1Id!, user2Id!);

    this.logger.log(`Chat ${chatSessionId} ended by user ${userId}`);
  }

  private async fetchChatSessionFromDatabase(
    chatSessionId: string,
  ): Promise<ChatSessionWithRelations | null> {
    const chatSession = await this.database.chatSession.findUnique({
      where: { id: chatSessionId },
      include: {
        user1: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        user2: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        venue: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return chatSession;
  }

  private async fetchMessagesFromDatabase(
    chatSessionId: string,
    options: MessagesOptions,
  ): Promise<MessageResponseDto[]> {
    const where: any = { chatSessionId };

    if (options.before) {
      where.createdAt = { lt: options.before };
    }

    const messages = await this.database.message.findMany({
      where,
      take: options.limit ?? DEFAULT_MESSAGE_LIMIT,
      orderBy: { createdAt: 'desc' },
    });

    console.log('messages from db (raw version, before mapping): ', messages);

    return messages
      .reverse()
      .map(message => this.mapToMessageResponse(message));
  }

  private validateUserIsParticipant(
    session: { user1Id: string | null; user2Id: string | null },
    userId: string,
  ): void {
    if (session.user1Id !== userId && session.user2Id !== userId) {
      throw new ForbiddenException(CHAT_MESSAGES.NOT_PARTICIPANT);
    }
  }

  private async getCachedMessages(
    chatSessionId: string,
    limit: number,
  ): Promise<MessageResponseDto[]> {
    try {
      const cachedMessages = await this.redis.getCachedMessages(
        chatSessionId,
        limit,
      );

      return cachedMessages.map(msg => ({
        id: msg.id,
        chatSessionId,
        senderId: msg.senderId,
        content: msg.content,
        createdAt: new Date(msg.timestamp),
        isRead: true,
      }));
    } catch (error) {
      this.logger.debug('Failed to get cached messages:', error);
      return [];
    }
  }

  private mapToSessionResponse(
    session: any,
    currentUserId: string,
  ): ChatSessionResponseDto {
    const isUser1 = session.user1Id === currentUserId;
    const partner = isUser1 ? session.user2 : session.user1;
    const partnerId = isUser1 ? session.user2Id : session.user1Id;

    if (!partner || !partnerId) {
      throw new NotFoundException('Partner not found in chat session');
    }

    return {
      id: session.id,
      status: session.status,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      venue: {
        id: session.venue.id,
        name: session.venue.name,
      },
      partner: {
        id: partnerId,
        firstName: partner.firstName,
        lastName: partner.lastName,
      },
    };
  }

  private mapToMessageResponse(message: any): MessageResponseDto {
    return {
      id: message.id,
      chatSessionId: message.chatSessionId,
      senderId: message.senderId,
      content: message.content,
      createdAt: message.createdAt,
    };
  }

  async checkExpiringChats(): Promise<
    Array<{ chatSessionId: string; minutesLeft: number }>
  > {
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    const expiringChats = await this.database.chatSession.findMany({
      where: {
        status: ChatSessionStatus.ACTIVE,
        expiresAt: {
          gt: now,
          lt: fiveMinutesFromNow,
        },
      },
      select: {
        id: true,
        expiresAt: true,
      },
    });

    return expiringChats.map(chat => ({
      chatSessionId: chat.id,
      minutesLeft: Math.ceil(
        (chat.expiresAt!.getTime() - now.getTime()) / 60000,
      ),
    }));
  }

  private startExpiredChatCleanup(): void {
    setInterval(async () => {
      try {
        const now = new Date();

        const expiredChats = await this.database.chatSession.findMany({
          where: {
            status: ChatSessionStatus.ACTIVE,
            expiresAt: { lt: now },
          },
          select: {
            id: true,
            user1Id: true,
            user2Id: true,
          },
        });

        if (expiredChats.length === 0) {
          return;
        }

        this.logger.log(`Found ${expiredChats.length} expired chat sessions`);

        for (const chat of expiredChats) {
          await this.database.chatSession.update({
            where: { id: chat.id },
            data: {
              status: ChatSessionStatus.EXPIRED,
            },
          });

          if (chat.user1Id && chat.user2Id) {
            await this.redis.deleteChatSession(
              chat.id,
              chat.user1Id,
              chat.user2Id,
            );
          }

          this.logger.log(`Chat ${chat.id} expired and cleaned up`);
        }
      } catch (error) {
        this.logger.error('Error in expired chat cleanup:', error);
      }
    }, 60000);
  }
}
