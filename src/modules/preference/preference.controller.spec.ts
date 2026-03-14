import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponseBuilder } from '@/common/utils/response-builder';
import { PREFERENCE_MESSAGES } from '@/modules/preference/constants/messages';
import { PreferenceController } from '@/modules/preference/preference.controller';
import { PreferenceService } from '@/modules/preference/preference.service';

describe('PreferenceController', () => {
  let preferenceController: PreferenceController;
  let preferenceService: PreferenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PreferenceController],
      providers: [
        {
          provide: PreferenceService,
          useValue: {
            exists: vi.fn(),
            getMyPreferences: vi.fn(),
            upsertPreferences: vi.fn(),
            deletePreferences: vi.fn(),
          },
        },
      ],
    }).compile();

    preferenceController = module.get<PreferenceController>(PreferenceController);
    preferenceService = module.get<PreferenceService>(PreferenceService);

    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkExists', () => {
    it('should return true if preferences exist', async () => {
      vi.spyOn(preferenceService, 'exists').mockResolvedValue(true);

      const result = await preferenceController.checkExists('user-1');

      expect(preferenceService.exists).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(
        ResponseBuilder.success({ exists: true }, PREFERENCE_MESSAGES.PREFERENCE_EXISTS),
      );
    });

    it('should return false if preferences do not exist', async () => {
      vi.spyOn(preferenceService, 'exists').mockResolvedValue(false);

      const result = await preferenceController.checkExists('user-1');

      expect(result).toEqual(
        ResponseBuilder.success({ exists: false }, PREFERENCE_MESSAGES.PREFERENCE_EXISTS),
      );
    });
  });

  describe('getMyPreferences', () => {
    it('should return preferences successfully', async () => {
      const mockPref = { id: 'pref-1', userId: 'user-1', minAge: 20, maxAge: 30 };
      vi.spyOn(preferenceService, 'getMyPreferences').mockResolvedValue(mockPref as any);

      const result = await preferenceController.getMyPreferences('user-1');

      expect(preferenceService.getMyPreferences).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(ResponseBuilder.success(mockPref, PREFERENCE_MESSAGES.PREFERENCE_FOUND));
    });
  });

  describe('upsertPreferences', () => {
    it('should update and return new preferences', async () => {
      const dto: any = { minAge: 20, maxAge: 30 };
      const mockPref = { id: 'pref-1', userId: 'user-1', ...dto };
      vi.spyOn(preferenceService, 'upsertPreferences').mockResolvedValue(mockPref as any);

      const result = await preferenceController.upsertPreferences('user-1', dto);

      expect(preferenceService.upsertPreferences).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(ResponseBuilder.success(mockPref, PREFERENCE_MESSAGES.PREFERENCE_UPDATED));
    });
  });

  describe('deletePreferences', () => {
    it('should delete preferences successfully', async () => {
      const result = await preferenceController.deletePreferences('user-1');

      expect(preferenceService.deletePreferences).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(ResponseBuilder.success(null, PREFERENCE_MESSAGES.PREFERENCE_DELETED));
    });
  });
});
