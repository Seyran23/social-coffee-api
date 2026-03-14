import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponseBuilder } from '@/common/utils/response-builder';
import { PROFILE_MESSAGES } from '@/modules/profile/constants/messages';
import { ProfileController } from '@/modules/profile/profile.controller';
import { ProfileService } from '@/modules/profile/profile.service';

describe('ProfileController', () => {
  let profileController: ProfileController;
  let profileService: ProfileService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            ttl: 60000,
            limit: 10,
          },
        ]),
      ],
      controllers: [ProfileController],
      providers: [
        {
          provide: ProfileService,
          useValue: {
            getMyProfile: vi.fn(),
            discoverProfiles: vi.fn(),
            updateMyProfile: vi.fn(),
            uploadProfileImage: vi.fn(),
            deleteProfileImage: vi.fn(),
          },
        },
      ],
    }).compile();

    profileController = module.get<ProfileController>(ProfileController);
    profileService = module.get<ProfileService>(ProfileService);

    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getMyProfile', () => {
    it('should return the users profile', async () => {
      const mockProfile = { id: 'user-1', firstName: 'John' };
      vi.spyOn(profileService, 'getMyProfile').mockResolvedValue(
        mockProfile as any,
      );

      const result = await profileController.getMyProfile('user-1');

      expect(profileService.getMyProfile).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(
        ResponseBuilder.success(
          mockProfile,
          PROFILE_MESSAGES.PROFILE_FETCHED,
          200,
        ),
      );
    });
  });

  describe('discoverProfiles', () => {
    it('should return a paginated feed', async () => {
      const mockFeed = { items: [{ id: 'user-2' }], nextCursor: 'token' };
      vi.spyOn(profileService, 'discoverProfiles').mockResolvedValue(
        mockFeed as any,
      );

      const query: any = { limit: 10, cursor: 'start' };
      const result = await profileController.discoverProfiles('user-1', query);

      expect(profileService.discoverProfiles).toHaveBeenCalledWith(
        'user-1',
        10,
        'start',
      );
      expect(result).toEqual(
        ResponseBuilder.success(
          mockFeed,
          PROFILE_MESSAGES.PROFILE_FEED_FETCHED,
        ),
      );
    });
  });

  describe('updateMyProfile', () => {
    it('should update and return the new profile', async () => {
      const dto: any = { bio: 'New bio' };
      const mockProfile = { id: 'user-1', bio: 'New bio' };
      vi.spyOn(profileService, 'updateMyProfile').mockResolvedValue(
        mockProfile as any,
      );

      const result = await profileController.updateMyProfile('user-1', dto);

      expect(profileService.updateMyProfile).toHaveBeenCalledWith(
        'user-1',
        dto,
      );
      expect(result).toEqual(
        ResponseBuilder.success(
          mockProfile,
          PROFILE_MESSAGES.PROFILE_UPDATED,
          200,
        ),
      );
    });
  });

  describe('uploadProfileImage', () => {
    it('should throw BadRequestException if file is missing', async () => {
      await expect(
        profileController.uploadProfileImage('user-1', undefined as any),
      ).rejects.toThrow(
        new BadRequestException(PROFILE_MESSAGES.NO_FILE_PROVIDED),
      );
    });

    it('should upload image, return url, and standard response payload', async () => {
      const mockFile = {
        originalname: 'test.jpg',
        buffer: Buffer.from(''),
      } as Express.Multer.File;
      const mockUrl = { profileImageUrl: 'https://s3.com/image.jpg' };
      vi.spyOn(profileService, 'uploadProfileImage').mockResolvedValue(mockUrl);

      const result = await profileController.uploadProfileImage(
        'user-1',
        mockFile,
      );

      expect(profileService.uploadProfileImage).toHaveBeenCalledWith(
        'user-1',
        mockFile,
      );
      expect(result).toEqual(
        ResponseBuilder.success(mockUrl, PROFILE_MESSAGES.IMAGE_UPLOADED, 200),
      );
    });
  });

  describe('deleteProfileImage', () => {
    it('should delete image and return success payload', async () => {
      const result = await profileController.deleteProfileImage('user-1');

      expect(profileService.deleteProfileImage).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(
        ResponseBuilder.success(null, PROFILE_MESSAGES.IMAGE_DELETED, 200),
      );
    });
  });
});
