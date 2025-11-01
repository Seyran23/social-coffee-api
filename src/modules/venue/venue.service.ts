import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VenueStatus } from '@prisma/client';

import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { VENUE_MESSAGES } from '@/modules/venue/constants/messages';
import { CreateVenueDto } from '@/modules/venue/dto/request/create-venue.dto';
import { GetVenuesQueryDto } from '@/modules/venue/dto/request/get-venues-query.dto';
import { UpdateVenueDto } from '@/modules/venue/dto/request/update-venue.dto';
import { VenueResponseDto } from '@/modules/venue/dto/response/venue-response.dto';
import { VenueWithQrCodeDto } from '@/modules/venue/dto/response/venue-with-qrcode.dto';
import { VenuesWithPagination } from '@/modules/venue/interfaces/venues-with-pagination.interface';
import { extractLatLonFromGoogleMaps } from '@/modules/venue/utils/map-url.util';
import { generateQRCodeDataURL } from '@/modules/venue/utils/qr-code.util';

@Injectable()
export class VenueService {
  constructor(
    private readonly database: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async getVenue(id: string): Promise<VenueWithQrCodeDto> {
    const venue = await this.database.venue.findUnique({
      where: { id },
    });

    if (!venue) {
      this.logger.warn(`Venue not found with ID: ${id}`);
      throw new NotFoundException(VENUE_MESSAGES.VENUE_NOT_FOUND);
    }

    const qrCode = await generateQRCodeDataURL(venue.id);

    this.logger.log(`Successfully retrieved venue: ${venue.name} (${id})`);
    return {
      ...venue,
      qrCode,
    };
  }

  async getVenueQRCode(id: string): Promise<string> {
    const venue = await this.database.venue.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!venue) {
      this.logger.warn(`Venue not found for QR code generation with ID: ${id}`);
      throw new NotFoundException(VENUE_MESSAGES.VENUE_NOT_FOUND);
    }

    this.logger.log(`Successfully generated QR code for venue ID: ${id}`);
    return generateQRCodeDataURL(venue.id);
  }

  async getVenues(params: GetVenuesQueryDto): Promise<VenuesWithPagination> {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;

    const validPage = Math.max(1, page);
    const validLimit = Math.min(Math.max(1, limit), 100);
    const skip = (validPage - 1) * validLimit;

    const where: Prisma.VenueWhereInput = {};

    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive',
      };
    }

    if (status) {
      where.status = status;
    }

    const orderBy: Prisma.VenueOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [venues, total] = await Promise.all([
      this.database.venue.findMany({
        where,
        skip,
        take: validLimit,
        orderBy,
        select: {
          id: true,
          name: true,
          mapUrl: true,
          latitude: true,
          longitude: true,
          geofenceMeters: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.database.venue.count({ where }),
    ]);

    this.logger.log(
      `Retrieved ${venues.length} venues out of ${total} total (page ${validPage}/${Math.ceil(total / validLimit)})`,
    );

    return {
      venues,
      total,
      page: validPage,
      limit: validLimit,
    };
  }

  async changeVenueStatus(
    id: string,
    status?: VenueStatus,
  ): Promise<VenueResponseDto> {
    const venue = await this.database.venue.findUnique({ where: { id } });

    if (!venue) {
      this.logger.warn(`Venue not found for status change with ID: ${id}`);
      throw new NotFoundException(VENUE_MESSAGES.VENUE_NOT_FOUND);
    }

    const newStatus =
      status ??
      (venue.status === VenueStatus.ACTIVE
        ? VenueStatus.TEMPORARILY_CLOSED
        : VenueStatus.ACTIVE);

    const updatedVenue = await this.database.venue.update({
      where: { id },
      data: { status: newStatus },
    });

    this.logger.log(
      `Successfully changed venue status: ${venue.name} (${id}) from ${venue.status} to ${newStatus}`,
    );

    return updatedVenue;
  }

  async createVenue(
    createVenueDto: CreateVenueDto,
  ): Promise<VenueWithQrCodeDto> {
    const coordinates = await extractLatLonFromGoogleMaps(
      createVenueDto.mapUrl,
    );

    if (!coordinates) {
      this.logger.warn(
        `Invalid map URL provided for venue: ${createVenueDto.name}`,
      );
      throw new BadRequestException(VENUE_MESSAGES.INVALID_MAP_URL);
    }

    const { latitude, longitude } = coordinates;

    const venue = await this.database.venue.create({
      data: {
        ...createVenueDto,
        latitude,
        longitude,
      },
    });

    const qrCode = await generateQRCodeDataURL(venue.id);

    this.logger.log(
      `Successfully created venue: ${venue.name} (${venue.id}) at coordinates (${latitude}, ${longitude})`,
    );

    return {
      ...venue,
      qrCode,
    };
  }

  async updateVenue(
    id: string,
    updateVenueDto: UpdateVenueDto,
  ): Promise<VenueResponseDto> {
    const venue = await this.database.venue.findUnique({ where: { id } });

    if (!venue) {
      this.logger.warn(`Venue not found for update with ID: ${id}`);
      throw new NotFoundException(VENUE_MESSAGES.VENUE_NOT_FOUND);
    }

    const updateData: Prisma.VenueUpdateInput = { ...updateVenueDto };

    if (updateVenueDto.mapUrl) {
      const coordinates = await extractLatLonFromGoogleMaps(
        updateVenueDto.mapUrl,
      );

      if (!coordinates) {
        this.logger.error('Failed to extract coordinates from map URL');
        throw new BadRequestException(VENUE_MESSAGES.INVALID_MAP_URL);
      }

      updateData.latitude = coordinates.latitude;
      updateData.longitude = coordinates.longitude;

      this.logger.log(
        `Extracted coordinates: lat=${coordinates.latitude}, lon=${coordinates.longitude}`,
      );
    }

    const updatedVenue = await this.database.venue.update({
      where: { id },
      data: updateData,
    });

    this.logger.log(`Successfully updated venue: ${updatedVenue.name} (${id})`);

    return updatedVenue;
  }

  async deleteVenue(id: string): Promise<VenueResponseDto> {
    const venue = await this.database.venue.findUnique({ where: { id } });

    if (!venue) {
      this.logger.warn(`Venue not found for deletion with ID: ${id}`);
      throw new NotFoundException(VENUE_MESSAGES.VENUE_NOT_FOUND);
    }

    const deletedVenue = await this.database.venue.update({
      where: { id },
      data: {
        status: VenueStatus.PERMANENTLY_CLOSED,
      },
    });

    this.logger.log(`Successfully soft deleted venue: ${venue.name} (${id})`);

    return deletedVenue;
  }
}
