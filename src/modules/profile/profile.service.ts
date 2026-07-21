import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Gender, InteractionType } from '@prisma/client';
import 'multer';

import { LoggerService } from '@/common/logger/logger.service';
import { sanitizePlainText } from '@/common/utils/sanitize';
import { PrismaService } from '@/database/prisma.service';
import {
  FILE_SIZE_LIMITS,
  IMAGE_TRANSFORMATIONS,
} from '@/modules/file-upload/constants/file-upload';
import { UploadFolder } from '@/modules/file-upload/interfaces/upload-options.interface';
import { FileUploadService } from '@/modules/file-upload/services/file-upload.service';
import {
  DEFAULT_PREFERENCES,
  FEED_DEFAULT_LIMIT,
  FEED_MAX_LIMIT,
} from '@/modules/profile/constants/defaults';
import { PROFILE_SELECT } from '@/modules/profile/constants/queries';
import { UpdateProfileDto } from '@/modules/profile/dto/request/update-profile.dto';
import { ProfilesForFeedPaginated } from '@/modules/profile/types/paginated-feed-profiles.type';
import { ProfileForFeed } from '@/modules/profile/types/profile-for-feed.type';
import { UserProfile } from '@/modules/profile/types/user-profile.type';
import { isInAgeRange } from '@/modules/profile/utils/age';
import {
  mapToProfile,
  mapToProfileForFeed,
} from '@/modules/profile/utils/mapper';
import { RedisService } from '@/modules/redis/redis.service';

import { PROFILE_MESSAGES } from './constants/messages';

@Injectable()
export class ProfileService {
  constructor(
    private readonly database: PrismaService,
    private readonly redis: RedisService,
    private readonly fileUploadService: FileUploadService,
    private readonly logger: LoggerService,
  ) {}

  private async fetchProfile(userId: string): Promise<UserProfile> {
    const cached = await this.redis.getCachedProfile(userId);
    if (cached) {
      this.logger.debug(`Profile cache hit for user: ${userId}`);
      return cached;
    }

    const user = await this.database.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { ...PROFILE_SELECT, email: true },
    });

    if (!user) {
      throw new NotFoundException(PROFILE_MESSAGES.PROFILE_NOT_FOUND);
    }

    const profile = mapToProfile(user);

    await this.redis.cacheProfile(userId, profile);

    this.logger.log(`Profile fetched and cached for user: ${userId}`);
    return profile;
  }

  private async fetchProfiles(userIds: string[]): Promise<UserProfile[]> {
    const { cached, uncachedIds } = await this.getFromCache(userIds);

    if (uncachedIds.length === 0) {
      return cached;
    }

    const freshProfiles = await this.fetchAndCacheProfiles(uncachedIds);
    return [...cached, ...freshProfiles];
  }

  async getMyProfile(userId: string): Promise<UserProfile> {
    const myProfile = await this.fetchProfile(userId);
    return myProfile;
  }

  async getUserProfile(userId: string): Promise<Omit<UserProfile, 'email'>> {
    const profile = await this.fetchProfile(userId);

    const { email, ...publicProfile } = profile;

    return publicProfile;
  }

  async updateMyProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserProfile> {
    if (dto.interestIds) {
      const existingCount = await this.database.interest.count({
        where: { id: { in: dto.interestIds } },
      });
      if (existingCount !== dto.interestIds.length) {
        throw new BadRequestException(PROFILE_MESSAGES.INVALID_INTEREST_IDS);
      }
    }

    const user = await this.database.$transaction(async tx => {
      if (dto.interestIds) {
        await tx.userInterest.deleteMany({ where: { userId } });

        if (dto.interestIds.length > 0) {
          await tx.userInterest.createMany({
            data: dto.interestIds.map(interestId => ({
              userId,
              interestId,
            })),
          });
        }
      }

      return tx.user.update({
        where: { id: userId },
        data: {
          ...(dto.firstName && { firstName: sanitizePlainText(dto.firstName) }),
          ...(dto.lastName && { lastName: sanitizePlainText(dto.lastName) }),
          ...(dto.bio !== undefined && { bio: sanitizePlainText(dto.bio) }),
          ...(dto.gender && { gender: dto.gender }),
          ...(dto.birthDate && { birthDate: new Date(dto.birthDate) }),
        },
        select: { ...PROFILE_SELECT, email: true },
      });
    });

    await this.redis.invalidateProfile(userId);

    this.logger.log(`Profile updated for user: ${userId}`);

    return mapToProfile(user);
  }

  async getInterests(): Promise<{ id: string; name: string }[]> {
    const interests = await this.database.interest.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return interests;
  }

  async uploadProfileImage(
    userId: string,
    file: Express.Multer.File,
  ): Promise<{ profileImageUrl: string }> {
    this.logger.log(`Uploading profile image for user: ${userId}`);

    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        profileImagePublicId: true,
      },
    });

    if (!user) {
      this.logger.warn(`User not found for image upload: ${userId}`);
      throw new NotFoundException(PROFILE_MESSAGES.PROFILE_NOT_FOUND);
    }

    try {
      const uploadResult = await this.fileUploadService.replaceFile(
        file,
        user.profileImagePublicId ?? undefined,
        {
          folder: UploadFolder.PROFILE,
          prefix: 'profile',
          userId,
          transformation: IMAGE_TRANSFORMATIONS.PROFILE,
          maxSize: FILE_SIZE_LIMITS.IMAGE,
        },
      );

      const updatedUser = await this.database.user.update({
        where: { id: userId },
        data: {
          profileImageUrl: uploadResult.secureUrl,
          profileImagePublicId: uploadResult.publicId,
        },
        select: {
          profileImageUrl: true,
        },
      });

      if (!updatedUser.profileImageUrl) {
        this.logger.error('Profile image URL is null after upload');
        throw new InternalServerErrorException('Failed to save profile image');
      }

      await this.redis.invalidateProfile(userId);

      this.logger.log(
        `Profile image uploaded successfully for user: ${userId}`,
      );

      return {
        profileImageUrl: updatedUser.profileImageUrl,
      };
    } catch (error) {
      this.logger.error(
        `Failed to upload profile image for user: ${userId}`,
        error.stack,
      );
      throw new BadRequestException(PROFILE_MESSAGES.IMAGE_UPLOAD_FAILED);
    }
  }

  async deleteProfileImage(userId: string): Promise<void> {
    this.logger.log(`Deleting profile image for user: ${userId}`);

    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        profileImagePublicId: true,
      },
    });

    if (!user) {
      this.logger.warn(`User not found for image deletion: ${userId}`);
      throw new NotFoundException(PROFILE_MESSAGES.PROFILE_NOT_FOUND);
    }

    if (!user.profileImagePublicId) {
      this.logger.warn(`No profile image to delete for user: ${userId}`);
      throw new BadRequestException(PROFILE_MESSAGES.NO_IMAGE_TO_DELETE);
    }

    try {
      await this.fileUploadService.deleteFile(user.profileImagePublicId);

      await this.database.user.update({
        where: { id: userId },
        data: { profileImageUrl: null, profileImagePublicId: null },
        select: { ...PROFILE_SELECT, email: true },
      });

      await this.redis.invalidateProfile(userId);

      this.logger.log(`Profile image deleted successfully for user: ${userId}`);

      return;
    } catch (error) {
      this.logger.error(
        `Failed to delete profile image for user: ${userId}`,
        error.stack,
      );
      throw new BadRequestException(PROFILE_MESSAGES.IMAGE_DELETE_FAILED);
    }
  }

  async discoverProfiles(
    userId: string,
    limit: number = FEED_DEFAULT_LIMIT,
    cursor?: string,
  ): Promise<ProfilesForFeedPaginated> {
    const clampedLimit = Math.min(Math.max(1, limit), FEED_MAX_LIMIT);

    const venueId = await this.redis.getUserCurrentVenue(userId);

    this.logger.log(`[DISCOVER] User ${userId} at venue ${venueId ?? 'NONE'}`);

    if (!venueId) {
      throw new BadRequestException(
        'You must be checked in to a venue to discover profiles',
      );
    }

    const myProfile = await this.fetchProfile(userId);
    const preferences = myProfile.preference ?? DEFAULT_PREFERENCES;

    this.logger.log(
      `[DISCOVER] User ${userId} preferences: minAge=${preferences.minAge}, maxAge=${preferences.maxAge}, gender=${preferences.preferredGender}`,
    );

    const otherUserIds = await this.getOtherUsersAtVenue(userId, venueId);

    this.logger.log(
      `[DISCOVER] Found ${otherUserIds.length} other users at venue: ${JSON.stringify(otherUserIds)}`,
    );

    if (otherUserIds.length === 0) {
      this.logger.warn(`[DISCOVER] No other users at venue ${venueId}`);
      return { profiles: [], total: 0, nextCursor: null, hasMore: false };
    }

    // Exclude users already liked or already matched
    const excludedIds = await this.getExcludedUserIds(userId, venueId);
    const eligibleUserIds = otherUserIds.filter(id => !excludedIds.has(id));

    this.logger.log(
      `[DISCOVER] Eligible users after exclusions: ${eligibleUserIds.length} (excluded ${excludedIds.size})`,
    );

    if (eligibleUserIds.length === 0) {
      return { profiles: [], total: 0, nextCursor: null, hasMore: false };
    }

    const allProfiles = await this.fetchProfiles(eligibleUserIds);

    this.logger.log(`[DISCOVER] Fetched ${allProfiles.length} profiles`);

    const filteredProfiles = this.filterByPreferences(allProfiles, preferences);

    this.logger.log(
      `[DISCOVER] After filtering: ${filteredProfiles.length} profiles match preferences`,
    );
    this.logger.log(
      `[DISCOVER] Filtered profile IDs: ${JSON.stringify(filteredProfiles.map(p => p.id))}`,
    );

    const discoveredProfiles = filteredProfiles.map(profile =>
      mapToProfileForFeed(profile),
    );

    return this.paginateProfiles(discoveredProfiles, clampedLimit, cursor);
  }

  private async getFromCache(
    userIds: string[],
  ): Promise<{ cached: UserProfile[]; uncachedIds: string[] }> {
    const cached: UserProfile[] = [];
    const uncachedIds: string[] = [];

    for (const userId of userIds) {
      const profile = await this.redis.getCachedProfile(userId);
      if (profile) {
        cached.push(profile);
      } else {
        uncachedIds.push(userId);
      }
    }

    return { cached, uncachedIds };
  }

  private async fetchAndCacheProfiles(
    userIds: string[],
  ): Promise<UserProfile[]> {
    // Include email so the cached profile shape matches the own-profile path
    // (the per-user cache key may later be hit by getMyProfile which expects email).
    const users = await this.database.user.findMany({
      where: { id: { in: userIds }, deletedAt: null },
      select: { ...PROFILE_SELECT, email: true },
    });

    const profiles: UserProfile[] = [];

    for (const user of users) {
      const profile = mapToProfile(user);
      await this.redis.cacheProfile(profile.id, profile);
      profiles.push(profile);
    }

    return profiles;
  }

  private async getOtherUsersAtVenue(
    userId: string,
    venueId: string,
  ): Promise<string[]> {
    const activeUsers = await this.redis.getActiveUsersAtVenue(venueId, userId);
    return activeUsers;
  }

  private async getExcludedUserIds(
    userId: string,
    venueId: string,
  ): Promise<Set<string>> {
    const excluded = new Set<string>();

    // 1. Users I already liked at this venue
    const myLikes = await this.database.interaction.findMany({
      where: { actorUserId: userId, venueId, type: InteractionType.LIKE },
      select: { targetUserId: true },
    });
    myLikes.forEach(i => excluded.add(i.targetUserId));

    // 2. Active match partner (already in a chat session together)
    const activeChatSessionId =
      await this.redis.getUserActiveChatSession(userId);
    if (activeChatSessionId) {
      const session = await this.redis.getChatSession(activeChatSessionId);
      if (session) {
        const partnerId =
          session.user1Id === userId ? session.user2Id : session.user1Id;
        if (partnerId) {
          excluded.add(partnerId);
        }
      }
    }

    return excluded;
  }

  private filterByPreferences(
    profiles: UserProfile[],
    preferences: {
      minAge: number;
      maxAge: number;
      preferredGender: Gender | null;
    },
  ): UserProfile[] {
    return profiles.filter(profile => {
      if (
        !isInAgeRange(profile.birthDate, preferences.minAge, preferences.maxAge)
      ) {
        return false;
      }

      return !(
        preferences.preferredGender !== null &&
        profile.gender !== preferences.preferredGender
      );
    });
  }

  private paginateProfiles(
    profiles: ProfileForFeed[],
    limit: number,
    cursor?: string,
  ): ProfilesForFeedPaginated {
    let paginatedProfiles = profiles;

    if (cursor) {
      const cursorIndex = profiles.findIndex(p => p.id === cursor);
      if (cursorIndex !== -1) {
        paginatedProfiles = profiles.slice(cursorIndex + 1);
      }
    }

    const resultProfiles = paginatedProfiles.slice(0, limit);
    const hasMore = paginatedProfiles.length > limit;
    const nextCursor = hasMore
      ? resultProfiles[resultProfiles.length - 1].id
      : null;

    return {
      profiles: resultProfiles,
      total: profiles.length,
      nextCursor,
      hasMore,
    };
  }
}
