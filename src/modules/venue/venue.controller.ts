import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { Roles } from '@/common/decorators/roles.decorator';
import {
  ApiAllErrorResponses,
  ApiCommonErrorResponses,
  ApiErrorResponse,
  ApiSuccessResponse,
  ApiValidationErrorResponse,
} from '@/common/decorators/swagger.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { ResponseBuilder } from '@/common/utils/response-builder';
import { VENUE_MESSAGES } from '@/modules/venue/constants/messages';
import { ChangeStatusDto } from '@/modules/venue/dto/request/change-status.dto';
import { CreateVenueDto } from '@/modules/venue/dto/request/create-venue.dto';
import { GetVenuesQueryDto } from '@/modules/venue/dto/request/get-venues-query.dto';
import { UpdateVenueDto } from '@/modules/venue/dto/request/update-venue.dto';
import { QRCodeResponseDto } from '@/modules/venue/dto/response/qrcode-response.dto';
import { VenueResponseDto } from '@/modules/venue/dto/response/venue-response.dto';
import { VenuePaginationResponseDto } from '@/modules/venue/dto/response/venue-with-pagination-response.dto';
import { VenueWithQrCodeDto } from '@/modules/venue/dto/response/venue-with-qrcode.dto';
import { VenueService } from '@/modules/venue/venue.service';

@ApiTags('Venues')
@Controller('venues')
export class VenueController {
  constructor(private readonly venueService: VenueService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Get all venues',
    description:
      'Retrieve a paginated list of venues with optional filtering by name, status, and sorting options.  Requires admin role.',
  })
  @ApiSuccessResponse(VenuePaginationResponseDto, {
    description: VENUE_MESSAGES.VENUES_RETRIEVED,
  })
  @ApiErrorResponse(500, 'Internal Server Error')
  async getVenues(@Query() query: GetVenuesQueryDto) {
    const { venues, total, page, limit } =
      await this.venueService.getVenues(query);

    return ResponseBuilder.paginated(
      venues,
      total,
      page,
      limit,
      VENUE_MESSAGES.VENUES_RETRIEVED,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Get venue by ID',
    description:
      'Retrieve detailed information about a specific venue including its QR code',
  })
  @ApiSuccessResponse(VenueWithQrCodeDto, {
    description: VENUE_MESSAGES.VENUE_RETRIEVED,
  })
  @ApiErrorResponse(404, VENUE_MESSAGES.VENUE_NOT_FOUND)
  @ApiErrorResponse(500, 'Internal Server Error')
  async getVenue(@Param('id') id: string) {
    const venue = await this.venueService.getVenue(id);
    return ResponseBuilder.success(venue, VENUE_MESSAGES.VENUE_RETRIEVED);
  }

  @Get(':id/qrcode')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Get venue QR code',
    description:
      'Generate and retrieve the QR code for a specific venue. The QR code is returned as a base64-encoded data URL. Requires admin role.',
  })
  @ApiSuccessResponse(QRCodeResponseDto, {
    description: VENUE_MESSAGES.QRCODE_GENERATED,
  })
  @ApiCommonErrorResponses()
  async getVenueQRCode(@Param('id') id: string) {
    const qrCode = await this.venueService.getVenueQRCode(id);
    return ResponseBuilder.success(
      { venueId: id, qrCode },
      VENUE_MESSAGES.QRCODE_GENERATED,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('jwt')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new venue',
    description:
      'Create a new venue with location details. Coordinates will be automatically extracted from the provided map URL. Requires admin role.',
  })
  @ApiSuccessResponse(VenueWithQrCodeDto, {
    description: VENUE_MESSAGES.VENUE_CREATED,
    status: 201,
  })
  @ApiAllErrorResponses()
  async createVenue(@Body() createVenueDto: CreateVenueDto) {
    const venue = await this.venueService.createVenue(createVenueDto);
    return ResponseBuilder.success(
      venue,
      VENUE_MESSAGES.VENUE_CREATED,
      HttpStatus.CREATED,
    );
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Update venue',
    description:
      'Update venue information such as name, map URL, or geofence radius. Requires admin role.',
  })
  @ApiSuccessResponse(VenueResponseDto, {
    description: VENUE_MESSAGES.VENUE_UPDATED,
  })
  @ApiAllErrorResponses()
  async updateVenue(
    @Param('id') id: string,
    @Body() updateVenueDto: UpdateVenueDto,
  ) {
    const venue = await this.venueService.updateVenue(id, updateVenueDto);
    return ResponseBuilder.success(venue, VENUE_MESSAGES.VENUE_UPDATED);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Toggle venue status',
    description:
      'Change venue status between ACTIVE, TEMPORARILY_CLOSED, or PERMANENTLY_CLOSED. If no status is provided, it toggles between ACTIVE and TEMPORARILY_CLOSED. Requires admin role.',
  })
  @ApiSuccessResponse(VenueResponseDto, {
    description: VENUE_MESSAGES.VENUE_STATUS_UPDATED,
  })
  @ApiValidationErrorResponse()
  @ApiCommonErrorResponses()
  async changeVenueStatus(
    @Param('id') id: string,
    @Body() changeStatusDto: ChangeStatusDto,
  ) {
    const venue = await this.venueService.changeVenueStatus(
      id,
      changeStatusDto.status,
    );
    return ResponseBuilder.success(venue, VENUE_MESSAGES.VENUE_STATUS_UPDATED);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('jwt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete venue',
    description:
      'Soft delete a venue by setting its status to PERMANENTLY_CLOSED. Requires admin role.',
  })
  @ApiSuccessResponse(VenueResponseDto, {
    description: VENUE_MESSAGES.VENUE_DELETED,
  })
  @ApiCommonErrorResponses()
  async deleteVenue(@Param('id') id: string) {
    const venue = await this.venueService.deleteVenue(id);
    return ResponseBuilder.success(venue, VENUE_MESSAGES.VENUE_DELETED);
  }
}
