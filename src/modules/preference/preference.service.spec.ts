import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { PREFERENCE_MESSAGES } from '@/modules/preference/constants/messages';
import { PreferenceService } from '@/modules/preference/preference.service';

describe('PreferenceService', () => {
  let preferenceService: PreferenceService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferenceService,
        {
          provide: PrismaService,
          useValue: {
            preference: {
              count: vi.fn(),
              findUnique: vi.fn(),
              upsert: vi.fn(),
              delete: vi.fn(),
            },
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

    preferenceService = module.get<PreferenceService>(PreferenceService);
    prismaService = module.get<PrismaService>(PrismaService);

    vi.clearAllMocks();
  });

  describe('exists', () => {
    it('should return true if preference exists', async () => {
      vi.spyOn(prismaService.preference, 'count').mockResolvedValue(1);
      const result = await preferenceService.exists('user-1');
      expect(result).toBe(true);
      expect(prismaService.preference.count).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('should return false if preference does not exist', async () => {
      vi.spyOn(prismaService.preference, 'count').mockResolvedValue(0);
      const result = await preferenceService.exists('user-1');
      expect(result).toBe(false);
    });
  });

  describe('getMyPreferences', () => {
    it('should throw NotFoundException if not found', async () => {
      vi.spyOn(prismaService.preference, 'findUnique').mockResolvedValue(null);
      await expect(
        preferenceService.getMyPreferences('user-1'),
      ).rejects.toThrow(
        new NotFoundException(PREFERENCE_MESSAGES.PREFERENCE_NOT_FOUND),
      );
    });

    it('should return the preference if found', async () => {
      const mockPref = {
        id: 'pref-1',
        userId: 'user-1',
        minAge: 20,
        maxAge: 30,
      };
      vi.spyOn(prismaService.preference, 'findUnique').mockResolvedValue(
        mockPref as any,
      );

      const result = await preferenceService.getMyPreferences('user-1');
      expect(result).toEqual(mockPref);
      expect(prismaService.preference.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });
  });

  describe('upsertPreferences', () => {
    const validDto = {
      minAge: 20,
      maxAge: 30,
      maxDistance: 50,
      pushMatch: true,
      pushMessage: true,
      pushPromo: false,
      preferredGender: 'FEMALE',
      lookingFor: 'FRIENDSHIP',
    } as any;

    it('should throw BadRequestException if minAge > maxAge', async () => {
      await expect(
        preferenceService.upsertPreferences('user-1', {
          ...validDto,
          minAge: 30,
          maxAge: 20,
        }),
      ).rejects.toThrow(
        new BadRequestException(PREFERENCE_MESSAGES.INVALID_AGE_RANGE),
      );
    });

    it('should upsert successfully and return preference', async () => {
      const mockUpsertedPref = { ...validDto, id: 'pref-1', userId: 'user-1' };
      vi.spyOn(prismaService.preference, 'upsert').mockResolvedValue(
        mockUpsertedPref as any,
      );

      const result = await preferenceService.upsertPreferences(
        'user-1',
        validDto,
      );

      expect(prismaService.preference.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        create: { userId: 'user-1', ...validDto },
        update: validDto,
      });
      expect(result).toEqual(mockUpsertedPref);
    });
  });

  describe('deletePreferences', () => {
    it('should throw NotFoundException if preference does not exist', async () => {
      vi.spyOn(prismaService.preference, 'findUnique').mockResolvedValue(null);

      await expect(
        preferenceService.deletePreferences('user-1'),
      ).rejects.toThrow(
        new NotFoundException(PREFERENCE_MESSAGES.PREFERENCE_NOT_FOUND),
      );
    });

    it('should delete preference successfully', async () => {
      vi.spyOn(prismaService.preference, 'findUnique').mockResolvedValue({
        id: 'pref-1',
      } as any);
      vi.spyOn(prismaService.preference, 'delete').mockResolvedValue({} as any);

      await preferenceService.deletePreferences('user-1');

      expect(prismaService.preference.delete).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });
  });
});
