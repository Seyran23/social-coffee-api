import { BadRequestException, Injectable } from '@nestjs/common';
import type { Campaign } from '@prisma/client';

import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';

import { CreateCampaignDto } from './dto/request/create-campaign.dto';

@Injectable()
export class CampaignService {
  constructor(
    private readonly database: PrismaService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(CampaignService.name);
  }

  async create(venueId: string, dto: CreateCampaignDto): Promise<Campaign> {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (endDate <= startDate) {
      throw new BadRequestException('Campaign endDate must be after startDate');
    }

    const campaign = await this.database.campaign.create({
      data: {
        venueId,
        name: dto.name,
        startDate,
        endDate,
        offer: dto.offer ?? null,
      },
    });

    this.logger.log(`Created campaign ${campaign.id} for venue ${venueId}`);
    return campaign;
  }

  list(venueId: string): Promise<Campaign[]> {
    return this.database.campaign.findMany({
      where: { venueId },
      orderBy: { startDate: 'desc' },
    });
  }
}
