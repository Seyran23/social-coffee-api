import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { UpdatePreferenceDto } from '@/modules/preference/dto/request/update-preference.dto';
import { PreferenceResponseDto } from '@/modules/preference/dto/response/preference-response.dto';

import { PREFERENCE_MESSAGES } from './constants/messages';

@Injectable()
export class PreferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async exists(userId: string): Promise<boolean> {
    const count = await this.prisma.preference.count({
      where: { userId },
    });
    return count > 0;
  }

  async getMyPreferences(userId: string): Promise<PreferenceResponseDto> {
    const preference = await this.prisma.preference.findUnique({
      where: { userId },
    });

    if (!preference) {
      throw new NotFoundException(PREFERENCE_MESSAGES.PREFERENCE_NOT_FOUND);
    }

    return preference;
  }

  async upsertPreferences(
    userId: string,
    dto: UpdatePreferenceDto,
  ): Promise<PreferenceResponseDto> {
    if (dto.minAge > dto.maxAge) {
      throw new BadRequestException(PREFERENCE_MESSAGES.INVALID_AGE_RANGE);
    }

    const preference = await this.prisma.preference.upsert({
      where: { userId },
      create: {
        userId,
        ...dto,
      },
      update: dto,
    });

    this.logger.log(`Preferences upserted for user: ${userId}`);

    return preference;
  }

  async deletePreferences(userId: string): Promise<void> {
    const preference = await this.prisma.preference.findUnique({
      where: { userId },
    });

    if (!preference) {
      throw new NotFoundException(PREFERENCE_MESSAGES.PREFERENCE_NOT_FOUND);
    }

    await this.prisma.preference.delete({
      where: { userId },
    });

    this.logger.log(`Preferences deleted for user: ${userId}`);
  }
}
