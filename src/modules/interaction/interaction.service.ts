import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatSessionStatus, InteractionType } from '@prisma/client';

import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { CHAT_SESSION_DURATION_MS } from '@/modules/interaction/constants/chat-duration';
import { InteractionResponseDto } from '@/modules/interaction/dto/response/interaction-response.dto';
import { MatchResultResponseDto } from '@/modules/interaction/dto/response/match-result-response.dto';
import { RedisService } from '@/modules/redis/redis.service';

import { PresenceGateway } from '../presence/presence.gateway';

import { INTERACTION_MESSAGES } from './constants/messages';

@Injectable()
export class InteractionService {
  constructor(
    private readonly database: PrismaService,
    private readonly redis: RedisService,
    private readonly presenceGateway: PresenceGateway,
    private readonly logger: LoggerService,
  ) {}

  async likeUser(
    actorUserId: string,
    targetUserId: string,
    venueId: string,
  ): Promise<MatchResultResponseDto> {
    if (actorUserId === targetUserId) {
      throw new BadRequestException(INTERACTION_MESSAGES.SELF_LIKE);
    }

    const [actorAtVenue, targetAtVenue] = await Promise.all([
      this.redis.isUserAtVenue(actorUserId, venueId),
      this.redis.isUserAtVenue(targetUserId, venueId),
    ]);

    if (!actorAtVenue || !targetAtVenue) {
      throw new BadRequestException(INTERACTION_MESSAGES.NOT_AT_VENUE);
    }

    const existingInteraction = await this.database.interaction.findUnique({
      where: {
        venueId_actorUserId_targetUserId_type: {
          venueId,
          actorUserId,
          targetUserId,
          type: InteractionType.LIKE,
        },
      },
    });

    if (existingInteraction) {
      throw new ConflictException(INTERACTION_MESSAGES.ALREADY_LIKED);
    }

    const [actorActiveChat, targetActiveChat] = await Promise.all([
      this.redis.getUserActiveChatSession(actorUserId),
      this.redis.getUserActiveChatSession(targetUserId),
    ]);

    if (actorActiveChat || targetActiveChat) {
      throw new BadRequestException(INTERACTION_MESSAGES.ALREADY_IN_CHAT);
    }

    await this.database.interaction.create({
      data: {
        venueId,
        actorUserId,
        targetUserId,
        type: InteractionType.LIKE,
      },
    });

    this.logger.log(
      `User ${actorUserId} liked user ${targetUserId} at venue ${venueId}`,
    );

    const mutualLike = await this.database.interaction.findUnique({
      where: {
        venueId_actorUserId_targetUserId_type: {
          venueId,
          actorUserId: targetUserId,
          targetUserId: actorUserId,
          type: InteractionType.LIKE,
        },
      },
    });

    if (mutualLike) {
      return this.handleMutualMatch(actorUserId, targetUserId, venueId);
    }

    return { matched: false };
  }

  async unlikeUser(actorUserId: string, targetUserId: string): Promise<void> {
    const venueId = await this.redis.getUserCurrentVenue(actorUserId);

    if (!venueId) {
      throw new BadRequestException(INTERACTION_MESSAGES.NOT_AT_VENUE);
    }

    const interaction = await this.database.interaction.findUnique({
      where: {
        venueId_actorUserId_targetUserId_type: {
          venueId,
          actorUserId,
          targetUserId,
          type: InteractionType.LIKE,
        },
      },
    });

    if (!interaction) {
      throw new NotFoundException(INTERACTION_MESSAGES.INTERACTION_NOT_FOUND);
    }

    await this.database.interaction.delete({
      where: { id: interaction.id },
    });

    this.logger.log(
      `User ${actorUserId} unliked user ${targetUserId} at venue ${venueId}`,
    );
  }

  async getMyLikes(userId: string): Promise<InteractionResponseDto[]> {
    const venueId = await this.redis.getUserCurrentVenue(userId);

    if (!venueId) {
      return [];
    }

    const interactions = await this.database.interaction.findMany({
      where: {
        actorUserId: userId,
        venueId,
        type: InteractionType.LIKE,
      },
      include: {
        targetUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImageUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return interactions.map(interaction => ({
      id: interaction.id,
      venueId: interaction.venueId,
      user: interaction.targetUser,
      createdAt: interaction.createdAt,
    }));
  }

  async getLikedMe(userId: string): Promise<InteractionResponseDto[]> {
    const venueId = await this.redis.getUserCurrentVenue(userId);

    if (!venueId) {
      return [];
    }

    const interactions = await this.database.interaction.findMany({
      where: {
        targetUserId: userId,
        venueId,
        type: InteractionType.LIKE,
      },
      include: {
        actorUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImageUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return interactions.map(interaction => ({
      id: interaction.id,
      venueId: interaction.venueId,
      user: interaction.actorUser,
      createdAt: interaction.createdAt,
    }));
  }

  private async handleMutualMatch(
    user1Id: string,
    user2Id: string,
    venueId: string,
  ): Promise<MatchResultResponseDto> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CHAT_SESSION_DURATION_MS);

    const chatSession = await this.database.chatSession.create({
      data: {
        venueId,
        user1Id,
        user2Id,
        status: ChatSessionStatus.ACTIVE,
        startedAt: now,
        expiresAt,
      },
      include: {
        user1: {
          select: { id: true, firstName: true, lastName: true },
        },
        user2: {
          select: { id: true, firstName: true, lastName: true },
        },
        venue: {
          select: { id: true, name: true },
        },
      },
    });

    await this.redis.setChatSession(chatSession.id, {
      id: chatSession.id,
      user1Id,
      user2Id,
      venueId,
      status: ChatSessionStatus.ACTIVE,
      startedAt: now.getTime(),
      expiresAt: expiresAt.getTime(),
      user1: chatSession.user1!,
      user2: chatSession.user2!,
      venue: chatSession.venue,
    });

    await Promise.all([
      this.redis.addUnreadMatch(user1Id, chatSession.id),
      this.redis.addUnreadMatch(user2Id, chatSession.id),
    ]);

    await this.redis.trackMatch(venueId);

    await this.database.interaction.deleteMany({
      where: {
        venueId,
        type: InteractionType.LIKE,
        OR: [
          { actorUserId: user1Id, targetUserId: user2Id },
          { actorUserId: user2Id, targetUserId: user1Id },
        ],
      },
    });

    await this.presenceGateway.notifyMatch(user1Id, user2Id, {
      chatSessionId: chatSession.id,
      venueId,
      venueName: chatSession.venue.name,
      expiresAt,
      user1: chatSession.user1!,
      user2: chatSession.user2!,
    });

    this.logger.log(
      `Mutual match! Users ${user1Id} & ${user2Id} at venue ${venueId}. Chat session: ${chatSession.id}`,
    );

    return {
      matched: true,
      chatSession: {
        id: chatSession.id,
        expiresAt,
        partner: chatSession.user2!,
      },
    };
  }

  async getMyLikesAtVenue(userId: string): Promise<string[]> {
    const venueId = await this.redis.getUserCurrentVenue(userId);

    if (!venueId) {
      return [];
    }

    const interactions = await this.database.interaction.findMany({
      where: {
        actorUserId: userId,
        venueId,
        type: InteractionType.LIKE,
      },
      select: {
        targetUserId: true,
      },
    });

    return interactions.map(i => i.targetUserId);
  }
}
