import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Gender } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { FileUploadService } from '@/modules/file-upload/services/file-upload.service';
import { PROFILE_MESSAGES } from '@/modules/profile/constants/messages';
import { ProfileService } from '@/modules/profile/profile.service';
import { RedisService } from '@/modules/redis/redis.service';

describe('ProfileService', () => {
  let profileService: ProfileService;
  let prismaService: PrismaService;
  let redisService: RedisService;
  let fileUploadService: FileUploadService;

  const mockDate = new Date('2000-01-01');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: vi.fn(),
              update: vi.fn(),
              findMany: vi.fn(),
            },
            interaction: {
              findMany: vi.fn(),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            getCachedProfile: vi.fn(),
            cacheProfile: vi.fn(),
            invalidateProfile: vi.fn(),
            getUserCurrentVenue: vi.fn(),
            getActiveUsersAtVenue: vi.fn(),
            getUserActiveChatSession: vi.fn(),
            getChatSession: vi.fn(),
          },
        },
        {
          provide: FileUploadService,
          useValue: {
            replaceFile: vi.fn(),
            deleteFile: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            log: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
          },
        },
      ],
    }).compile();

    profileService = module.get<ProfileService>(ProfileService);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
    fileUploadService = module.get<FileUploadService>(FileUploadService);
  });

  describe('getUserProfile', () => {
    it('should return cached profile without email if available in Redis', async () => {
      vi.spyOn(redisService, 'getCachedProfile').mockResolvedValueOnce({
        id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        bio: 'Hello',
        birthDate: mockDate,
        gender: Gender.MALE,
        preference: null,
      } as any);

      const result = await profileService.getUserProfile('user-1');

      expect(redisService.getCachedProfile).toHaveBeenCalledWith('user-1');
      expect(prismaService.user.findUnique).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('email');
      expect(result.firstName).toBe('John');
    });

    it('should fetch from DB, cache, and return profile without email if not in Redis', async () => {
      vi.spyOn(redisService, 'getCachedProfile').mockResolvedValueOnce(null);
      vi.spyOn(prismaService.user, 'findUnique').mockResolvedValueOnce({
        id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        bio: 'Hello',
        birthDate: mockDate,
        gender: Gender.MALE,
        preference: null,
      } as any);

      const result = await profileService.getUserProfile('user-1');

      expect(prismaService.user.findUnique).toHaveBeenCalled();
      expect(redisService.cacheProfile).toHaveBeenCalled();
      expect(result).not.toHaveProperty('email');
    });

    it('should throw NotFoundException if user is not in cache and not in DB', async () => {
      vi.spyOn(redisService, 'getCachedProfile').mockResolvedValueOnce(null);
      vi.spyOn(prismaService.user, 'findUnique').mockResolvedValueOnce(null);

      await expect(profileService.getUserProfile('user-1')).rejects.toThrow(
        new NotFoundException(PROFILE_MESSAGES.PROFILE_NOT_FOUND),
      );
    });
  });

  describe('discoverProfiles', () => {
    it('should throw BadRequestException if user is not checked into a venue', async () => {
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValueOnce(null);

      await expect(profileService.discoverProfiles('user-1')).rejects.toThrow(
        new BadRequestException(
          'You must be checked in to a venue to discover profiles',
        ),
      );
    });

    it('should return empty if no other users are at the venue', async () => {
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValueOnce(
        'venue-1',
      );

      // Mock fetchProfile implementation
      vi.spyOn(redisService, 'getCachedProfile').mockResolvedValueOnce({
        id: 'user-1',
        preference: null,
      } as any);

      vi.spyOn(redisService, 'getActiveUsersAtVenue').mockResolvedValueOnce([]);

      const result = await profileService.discoverProfiles('user-1');

      expect(result.profiles).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should exclude already liked users and active chat partners', async () => {
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValueOnce(
        'venue-1',
      );

      // Mock caching logic so user-1 returns its preferences and others miss the cache
      vi.spyOn(redisService, 'getCachedProfile').mockImplementation(
        async (id: string) => {
          if (id === 'user-1') {
            return {
              id: 'user-1',
              preference: {
                minAge: 18,
                maxAge: 30,
                preferredGender: Gender.FEMALE,
              },
            } as any;
          }
          return null;
        },
      );

      // Other users at venue:
      // user-2 (already liked)
      // user-3 (active chat partner)
      // user-4 (eligible)
      vi.spyOn(redisService, 'getActiveUsersAtVenue').mockResolvedValueOnce([
        'user-2',
        'user-3',
        'user-4',
      ]);

      // 1. Exclude user-2 because I already liked them
      vi.spyOn(prismaService.interaction, 'findMany').mockResolvedValueOnce([
        { targetUserId: 'user-2' } as any,
      ]);

      // 2. Exclude user-3 because we are in an active chat
      vi.spyOn(redisService, 'getUserActiveChatSession').mockResolvedValueOnce(
        'chat-1',
      );
      vi.spyOn(redisService, 'getChatSession').mockResolvedValueOnce({
        user1Id: 'user-1',
        user2Id: 'user-3',
      } as any);

      // This leaves only user-4 as eligible.
      // fetchProfiles gets user-4
      vi.spyOn(prismaService.user, 'findMany').mockResolvedValueOnce([
        {
          id: 'user-4',
          firstName: 'Jane',
          birthDate: new Date('2005-01-01'), // age ~21
          gender: Gender.FEMALE, // matches preference
        } as any,
      ]);

      const result = await profileService.discoverProfiles('user-1', 10);

      expect(result.total).toBe(1);
      expect(result.profiles[0].id).toBe('user-4');
    });

    it('should filter out eligible users who do not match age or gender preferences', async () => {
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValueOnce(
        'venue-1',
      );

      vi.spyOn(redisService, 'getCachedProfile').mockImplementation(
        async (id: string) => {
          if (id === 'user-1') {
            return {
              id: 'user-1',
              preference: {
                minAge: 20,
                maxAge: 25,
                preferredGender: Gender.MALE,
              },
            } as any;
          }
          return null;
        },
      );

      vi.spyOn(redisService, 'getActiveUsersAtVenue').mockResolvedValueOnce([
        'user-2',
        'user-3',
      ]);
      vi.spyOn(prismaService.interaction, 'findMany').mockResolvedValueOnce([]); // No liked users
      vi.spyOn(redisService, 'getUserActiveChatSession').mockResolvedValueOnce(
        null,
      ); // No active chats

      // Both are eligible, but do they match preferences?
      vi.spyOn(prismaService.user, 'findMany').mockResolvedValueOnce([
        {
          id: 'user-2',
          firstName: 'Tom',
          birthDate: new Date('1990-01-01'), // Age > 25, should be filtered OUT
          gender: Gender.MALE,
        } as any,
        {
          id: 'user-3',
          firstName: 'Jerry',
          birthDate: new Date('2003-01-01'), // Age ~23, fits 20-25!
          gender: Gender.FEMALE, // Wrong gender, should be filtered OUT
        } as any,
      ]);

      const result = await profileService.discoverProfiles('user-1', 10);

      // Neither user matches the preference
      expect(result.total).toBe(0);
      expect(result.profiles).toHaveLength(0);
    });
  });
});
