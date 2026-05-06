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

    it('should return empty when all eligible users are excluded', async () => {
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValueOnce(
        'venue-1',
      );
      vi.spyOn(redisService, 'getCachedProfile').mockResolvedValueOnce({
        id: 'user-1',
        preference: null,
      } as any);
      vi.spyOn(redisService, 'getActiveUsersAtVenue').mockResolvedValueOnce([
        'user-2',
      ]);
      // user-2 is already liked — becomes excluded
      vi.spyOn(prismaService.interaction, 'findMany').mockResolvedValueOnce([
        { targetUserId: 'user-2' } as any,
      ]);
      vi.spyOn(redisService, 'getUserActiveChatSession').mockResolvedValueOnce(
        null,
      );

      const result = await profileService.discoverProfiles('user-1');

      expect(result.profiles).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should apply default preferences when user has none set', async () => {
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValueOnce(
        'venue-1',
      );
      // No preference set — defaults apply (18-100, any gender)
      vi.spyOn(redisService, 'getCachedProfile').mockResolvedValueOnce({
        id: 'user-1',
        preference: null,
      } as any);
      vi.spyOn(redisService, 'getActiveUsersAtVenue').mockResolvedValueOnce([
        'user-2',
      ]);
      vi.spyOn(prismaService.interaction, 'findMany').mockResolvedValueOnce([]);
      vi.spyOn(redisService, 'getUserActiveChatSession').mockResolvedValueOnce(
        null,
      );
      vi.spyOn(prismaService.user, 'findMany').mockResolvedValueOnce([
        {
          id: 'user-2',
          firstName: 'Bob',
          birthDate: new Date('1995-06-15'), // ~30 years old — within default 18-100
          gender: Gender.MALE,
          userInterests: [],
          preference: null,
        } as any,
      ]);

      const result = await profileService.discoverProfiles('user-1');

      expect(result.profiles).toHaveLength(1);
      expect(result.profiles[0].id).toBe('user-2');
    });
  });

  describe('getMyProfile', () => {
    it('should return the full profile including email from cache', async () => {
      vi.spyOn(redisService, 'getCachedProfile').mockResolvedValueOnce({
        id: 'user-1',
        firstName: 'Alice',
        email: 'alice@example.com',
        birthDate: mockDate,
        gender: Gender.FEMALE,
        preference: null,
      } as any);

      const result = await profileService.getMyProfile('user-1');

      expect(result).toHaveProperty('email', 'alice@example.com');
      expect(result.firstName).toBe('Alice');
    });

    it('should fetch from DB and cache when profile is not cached', async () => {
      vi.spyOn(redisService, 'getCachedProfile').mockResolvedValueOnce(null);
      vi.spyOn(prismaService.user, 'findUnique').mockResolvedValueOnce({
        id: 'user-1',
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@example.com',
        bio: null,
        birthDate: mockDate,
        gender: Gender.FEMALE,
        profileImageUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userInterests: [],
        preference: null,
      } as any);

      const result = await profileService.getMyProfile('user-1');

      expect(prismaService.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1', deletedAt: null } }),
      );
      expect(redisService.cacheProfile).toHaveBeenCalledWith(
        'user-1',
        expect.any(Object),
      );
      expect(result).toHaveProperty('email', 'alice@example.com');
    });

    it('should throw NotFoundException when user does not exist in DB', async () => {
      vi.spyOn(redisService, 'getCachedProfile').mockResolvedValueOnce(null);
      vi.spyOn(prismaService.user, 'findUnique').mockResolvedValueOnce(null);

      await expect(profileService.getMyProfile('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateMyProfile', () => {
    it('should sanitize firstName, lastName, and bio before persisting', async () => {
      const updatedUser = {
        id: 'user-1',
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@example.com',
        bio: 'Clean bio',
        birthDate: mockDate,
        gender: Gender.FEMALE,
        profileImageUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userInterests: [],
        preference: null,
      };

      vi.spyOn(prismaService.user, 'update').mockResolvedValueOnce(
        updatedUser as any,
      );

      const result = await profileService.updateMyProfile('user-1', {
        firstName: 'Alice',
        lastName: 'Smith',
        bio: 'Clean bio',
      });

      expect(prismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            firstName: 'Alice',
            lastName: 'Smith',
            bio: 'Clean bio',
          }),
        }),
      );
      expect(redisService.invalidateProfile).toHaveBeenCalledWith('user-1');
      expect(result.firstName).toBe('Alice');
    });

    it('should not include missing fields in the update payload', async () => {
      const updatedUser = {
        id: 'user-1',
        firstName: 'Bob',
        lastName: 'Jones',
        email: 'bob@example.com',
        bio: null,
        birthDate: mockDate,
        gender: Gender.MALE,
        profileImageUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userInterests: [],
        preference: null,
      };

      vi.spyOn(prismaService.user, 'update').mockResolvedValueOnce(
        updatedUser as any,
      );

      // Only firstName provided — lastName and bio should be absent from data
      await profileService.updateMyProfile('user-1', { firstName: 'Bob' });

      const callArgs = vi.mocked(prismaService.user.update).mock.calls[0][0];
      expect(callArgs.data).not.toHaveProperty('lastName');
      expect(callArgs.data).not.toHaveProperty('bio');
    });

    it('should include bio as empty string when explicitly set to empty', async () => {
      const updatedUser = {
        id: 'user-1',
        firstName: 'Bob',
        lastName: 'Jones',
        email: 'bob@example.com',
        bio: '',
        birthDate: mockDate,
        gender: Gender.MALE,
        profileImageUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userInterests: [],
        preference: null,
      };

      vi.spyOn(prismaService.user, 'update').mockResolvedValueOnce(
        updatedUser as any,
      );

      await profileService.updateMyProfile('user-1', { bio: '' });

      const callArgs = vi.mocked(prismaService.user.update).mock.calls[0][0];
      expect(callArgs.data).toHaveProperty('bio');
    });
  });

  describe('fetchAndCacheProfiles (via discoverProfiles)', () => {
    it('should cache each fetched profile individually', async () => {
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValueOnce(
        'venue-1',
      );
      vi.spyOn(redisService, 'getCachedProfile').mockImplementation(
        async (id: string) => {
          if (id === 'user-1') {
            return { id: 'user-1', preference: null } as any;
          }
          // All others — cache miss
          return null;
        },
      );
      vi.spyOn(redisService, 'getActiveUsersAtVenue').mockResolvedValueOnce([
        'user-2',
        'user-3',
      ]);
      vi.spyOn(prismaService.interaction, 'findMany').mockResolvedValueOnce([]);
      vi.spyOn(redisService, 'getUserActiveChatSession').mockResolvedValueOnce(
        null,
      );

      const now = new Date();
      vi.spyOn(prismaService.user, 'findMany').mockResolvedValueOnce([
        {
          id: 'user-2',
          firstName: 'Carol',
          lastName: 'White',
          email: 'carol@example.com',
          bio: null,
          birthDate: new Date('1998-03-10'),
          gender: Gender.FEMALE,
          profileImageUrl: null,
          createdAt: now,
          updatedAt: now,
          userInterests: [],
          preference: null,
        } as any,
        {
          id: 'user-3',
          firstName: 'Dave',
          lastName: 'Black',
          email: 'dave@example.com',
          bio: null,
          birthDate: new Date('1997-07-22'),
          gender: Gender.MALE,
          profileImageUrl: null,
          createdAt: now,
          updatedAt: now,
          userInterests: [],
          preference: null,
        } as any,
      ]);

      await profileService.discoverProfiles('user-1');

      // cacheProfile should have been called once per returned user
      expect(redisService.cacheProfile).toHaveBeenCalledWith(
        'user-2',
        expect.objectContaining({ id: 'user-2' }),
      );
      expect(redisService.cacheProfile).toHaveBeenCalledWith(
        'user-3',
        expect.objectContaining({ id: 'user-3' }),
      );
    });

    it('should serve profiles from cache without hitting the DB', async () => {
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValueOnce(
        'venue-1',
      );

      const now = new Date();
      // All users — including the two eligible ones — are already cached
      vi.spyOn(redisService, 'getCachedProfile').mockImplementation(
        async (id: string) => {
          const map: Record<string, any> = {
            'user-1': { id: 'user-1', preference: null },
            'user-2': {
              id: 'user-2',
              firstName: 'Eve',
              lastName: 'Green',
              email: 'eve@example.com',
              bio: null,
              birthDate: new Date('1999-01-01'),
              gender: Gender.FEMALE,
              profileImageUrl: null,
              interests: [],
              preference: null,
              createdAt: now,
              updatedAt: now,
            },
          };
          return map[id] ?? null;
        },
      );
      vi.spyOn(redisService, 'getActiveUsersAtVenue').mockResolvedValueOnce([
        'user-2',
      ]);
      vi.spyOn(prismaService.interaction, 'findMany').mockResolvedValueOnce([]);
      vi.spyOn(redisService, 'getUserActiveChatSession').mockResolvedValueOnce(
        null,
      );

      await profileService.discoverProfiles('user-1');

      // DB should NOT have been queried for any user profiles
      expect(prismaService.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getExcludedUserIds', () => {
    it('should exclude both liked users and active chat partner', async () => {
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValueOnce(
        'venue-1',
      );
      vi.spyOn(redisService, 'getCachedProfile').mockResolvedValueOnce({
        id: 'user-1',
        preference: null,
      } as any);
      vi.spyOn(redisService, 'getActiveUsersAtVenue').mockResolvedValueOnce([
        'user-2',
        'user-3',
        'user-4',
      ]);

      // user-2 already liked
      vi.spyOn(prismaService.interaction, 'findMany').mockResolvedValueOnce([
        { targetUserId: 'user-2' } as any,
      ]);

      // user-3 is the active chat partner
      vi.spyOn(redisService, 'getUserActiveChatSession').mockResolvedValueOnce(
        'session-99',
      );
      vi.spyOn(redisService, 'getChatSession').mockResolvedValueOnce({
        user1Id: 'user-1',
        user2Id: 'user-3',
      } as any);

      // user-4 is eligible — cache miss → DB fetch
      vi.spyOn(prismaService.user, 'findMany').mockResolvedValueOnce([
        {
          id: 'user-4',
          firstName: 'Frank',
          lastName: 'Lee',
          email: 'frank@example.com',
          bio: null,
          birthDate: new Date('2000-05-20'),
          gender: Gender.MALE,
          profileImageUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          userInterests: [],
          preference: null,
        } as any,
      ]);

      const result = await profileService.discoverProfiles('user-1');

      // Only user-4 should appear
      expect(result.profiles.map(p => p.id)).toEqual(['user-4']);
    });

    it('should not add a partner when there is no active chat session', async () => {
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValueOnce(
        'venue-1',
      );
      vi.spyOn(redisService, 'getCachedProfile').mockResolvedValueOnce({
        id: 'user-1',
        preference: null,
      } as any);
      vi.spyOn(redisService, 'getActiveUsersAtVenue').mockResolvedValueOnce([
        'user-2',
      ]);
      vi.spyOn(prismaService.interaction, 'findMany').mockResolvedValueOnce([]);
      // No active session
      vi.spyOn(redisService, 'getUserActiveChatSession').mockResolvedValueOnce(
        null,
      );

      vi.spyOn(prismaService.user, 'findMany').mockResolvedValueOnce([
        {
          id: 'user-2',
          firstName: 'Grace',
          lastName: 'Kim',
          email: 'grace@example.com',
          bio: null,
          birthDate: new Date('2001-11-11'),
          gender: Gender.FEMALE,
          profileImageUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          userInterests: [],
          preference: null,
        } as any,
      ]);

      const result = await profileService.discoverProfiles('user-1');

      expect(result.profiles).toHaveLength(1);
      expect(result.profiles[0].id).toBe('user-2');
    });
  });

  describe('filterByPreferences', () => {
    it('should keep users whose age and gender match', async () => {
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValueOnce(
        'venue-1',
      );
      vi.spyOn(redisService, 'getCachedProfile').mockResolvedValueOnce({
        id: 'user-1',
        preference: {
          minAge: 22,
          maxAge: 28,
          preferredGender: Gender.FEMALE,
        },
      } as any);
      vi.spyOn(redisService, 'getActiveUsersAtVenue').mockResolvedValueOnce([
        'user-2',
        'user-3',
      ]);
      vi.spyOn(prismaService.interaction, 'findMany').mockResolvedValueOnce([]);
      vi.spyOn(redisService, 'getUserActiveChatSession').mockResolvedValueOnce(
        null,
      );

      const now = new Date();
      // user-2: female, 24 → matches
      // user-3: male, 25 → gender mismatch
      vi.spyOn(prismaService.user, 'findMany').mockResolvedValueOnce([
        {
          id: 'user-2',
          firstName: 'Heidi',
          lastName: 'Black',
          email: 'h@example.com',
          bio: null,
          birthDate: new Date(
            now.getFullYear() - 24,
            now.getMonth(),
            now.getDate(),
          ),
          gender: Gender.FEMALE,
          profileImageUrl: null,
          createdAt: now,
          updatedAt: now,
          userInterests: [],
          preference: null,
        } as any,
        {
          id: 'user-3',
          firstName: 'Ivan',
          lastName: 'Stone',
          email: 'i@example.com',
          bio: null,
          birthDate: new Date(
            now.getFullYear() - 25,
            now.getMonth(),
            now.getDate(),
          ),
          gender: Gender.MALE,
          profileImageUrl: null,
          createdAt: now,
          updatedAt: now,
          userInterests: [],
          preference: null,
        } as any,
      ]);

      const result = await profileService.discoverProfiles('user-1');

      expect(result.profiles).toHaveLength(1);
      expect(result.profiles[0].id).toBe('user-2');
    });

    it('should keep all users when preferredGender is null', async () => {
      vi.spyOn(redisService, 'getUserCurrentVenue').mockResolvedValueOnce(
        'venue-1',
      );
      vi.spyOn(redisService, 'getCachedProfile').mockResolvedValueOnce({
        id: 'user-1',
        preference: { minAge: 18, maxAge: 100, preferredGender: null },
      } as any);
      vi.spyOn(redisService, 'getActiveUsersAtVenue').mockResolvedValueOnce([
        'user-2',
        'user-3',
      ]);
      vi.spyOn(prismaService.interaction, 'findMany').mockResolvedValueOnce([]);
      vi.spyOn(redisService, 'getUserActiveChatSession').mockResolvedValueOnce(
        null,
      );

      const now = new Date();
      vi.spyOn(prismaService.user, 'findMany').mockResolvedValueOnce([
        {
          id: 'user-2',
          firstName: 'Jill',
          lastName: 'Fox',
          email: 'j@example.com',
          bio: null,
          birthDate: new Date(
            now.getFullYear() - 23,
            now.getMonth(),
            now.getDate(),
          ),
          gender: Gender.FEMALE,
          profileImageUrl: null,
          createdAt: now,
          updatedAt: now,
          userInterests: [],
          preference: null,
        } as any,
        {
          id: 'user-3',
          firstName: 'Ken',
          lastName: 'Hill',
          email: 'k@example.com',
          bio: null,
          birthDate: new Date(
            now.getFullYear() - 27,
            now.getMonth(),
            now.getDate(),
          ),
          gender: Gender.MALE,
          profileImageUrl: null,
          createdAt: now,
          updatedAt: now,
          userInterests: [],
          preference: null,
        } as any,
      ]);

      const result = await profileService.discoverProfiles('user-1');

      expect(result.profiles).toHaveLength(2);
    });
  });
});
