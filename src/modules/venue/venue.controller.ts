import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Role } from '@prisma/client';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import {
  ApiAllErrorResponses,
  ApiCommonErrorResponses,
  ApiErrorResponse,
  ApiMessageResponse,
  ApiSuccessResponse,
  ApiValidationErrorResponse,
} from '@/common/decorators/swagger.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { VenueOwnershipGuard } from '@/common/guards/venue-ownership.guard';
import { ResponseBuilder } from '@/common/utils/response-builder';
import { UploadFile } from '@/modules/file-upload/decorators/upload-file.decorator';
import { FileUploadInterceptor } from '@/modules/file-upload/interceptors/file-upload.interceptor';
import { VENUE_MESSAGES } from '@/modules/venue/constants/messages';
import { AssignOwnerDto } from '@/modules/venue/dto/request/assign-owner.dto';
import { ChangeStatusDto } from '@/modules/venue/dto/request/change-status.dto';
import { CheckInDto } from '@/modules/venue/dto/request/check-in.dto';
import { CreateVenueDto } from '@/modules/venue/dto/request/create-venue.dto';
import { GetNearbyVenuesQueryDto } from '@/modules/venue/dto/request/get-nearby-venues-query.dto';
import { GetVenuesQueryDto } from '@/modules/venue/dto/request/get-venues-query.dto';
import { UpdateVenueDto } from '@/modules/venue/dto/request/update-venue.dto';
import { QRCodeResponseDto } from '@/modules/venue/dto/response/qrcode-response.dto';
import { VenueImageUploadDto } from '@/modules/venue/dto/response/venue-image-upload.dto';
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

  @Get('nearby')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Get nearby venues',
    description:
      'Retrieve active venues within a given radius of the provided coordinates, sorted nearest first. Defaults to a 5km radius.',
  })
  @ApiSuccessResponse(VenueResponseDto, {
    description: VENUE_MESSAGES.NEARBY_VENUES_RETRIEVED,
    isArray: true,
  })
  @ApiValidationErrorResponse()
  @ApiCommonErrorResponses()
  async getNearbyVenues(@Query() query: GetNearbyVenuesQueryDto) {
    const venues = await this.venueService.getNearbyVenues(query);
    return ResponseBuilder.success(
      venues,
      VENUE_MESSAGES.NEARBY_VENUES_RETRIEVED,
    );
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Get venues I own',
    description:
      'Retrieve the venues owned by the authenticated user (their dashboard venues). Returns an empty array for users who own no venues.',
  })
  @ApiSuccessResponse(VenueResponseDto, {
    description: VENUE_MESSAGES.MY_VENUES_RETRIEVED,
    isArray: true,
  })
  @ApiCommonErrorResponses()
  async getMyVenues(@CurrentUser('userId') userId: string) {
    const venues = await this.venueService.getVenuesByOwner(userId);
    return ResponseBuilder.success(venues, VENUE_MESSAGES.MY_VENUES_RETRIEVED);
  }

  @Get('me/current')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Get my current check-in',
    description:
      "Retrieve the venue the authenticated user is currently checked into, or null if they aren't checked in anywhere. Lets a client restore check-in state after a relaunch instead of relying on in-memory state alone.",
  })
  @ApiSuccessResponse(VenueResponseDto, {
    description: VENUE_MESSAGES.CURRENT_CHECK_IN_RETRIEVED,
  })
  @ApiCommonErrorResponses()
  async getCurrentCheckIn(@CurrentUser('userId') userId: string) {
    const venue = await this.venueService.getCurrentCheckIn(userId);
    return ResponseBuilder.success(
      venue,
      VENUE_MESSAGES.CURRENT_CHECK_IN_RETRIEVED,
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
  @UseGuards(JwtAuthGuard, RolesGuard, VenueOwnershipGuard)
  @Roles(Role.CAFE_MANAGER, Role.ADMIN)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Update venue',
    description:
      'Update venue information such as name, map URL, or geofence radius. Requires venue ownership or admin role. Only an admin may change venue status through this endpoint.',
  })
  @ApiSuccessResponse(VenueResponseDto, {
    description: VENUE_MESSAGES.VENUE_UPDATED,
  })
  @ApiAllErrorResponses()
  async updateVenue(
    @Param('id') id: string,
    @Body() updateVenueDto: UpdateVenueDto,
    @CurrentUser('role') role: Role,
  ) {
    if (role !== Role.ADMIN) {
      delete updateVenueDto.status;
    }
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

  @Post(':id/checkin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiBearerAuth('jwt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check-in to venue',
    description:
      'Check-in to a venue. Validates venue is active and user is within geofence.',
  })
  @ApiSuccessResponse(VenueResponseDto, {
    description: VENUE_MESSAGES.CHECK_IN_SUCCESS,
  })
  @ApiErrorResponse(400, VENUE_MESSAGES.OUTSIDE_GEOFENCE)
  @ApiErrorResponse(404, VENUE_MESSAGES.VENUE_NOT_FOUND)
  async checkinToVenue(
    @Param('id') venueId: string,
    @Body() checkInDto: CheckInDto,
    @CurrentUser('userId') userId: string,
  ) {
    const result = await this.venueService.checkIn(userId, venueId, checkInDto);
    return ResponseBuilder.success(result, VENUE_MESSAGES.CHECK_IN_SUCCESS);
  }

  @Post(':id/checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER, Role.ADMIN)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Check-out from venue',
    description:
      'Check-out from a venue. Validates user is currently checked in to the venue.',
  })
  @ApiSuccessResponse(VenueResponseDto, {
    description: VENUE_MESSAGES.CHECK_OUT_SUCCESS,
  })
  @ApiErrorResponse(400, VENUE_MESSAGES.NOT_CHECKED_IN)
  async checkoutFromVenue(
    @Param('id') venueId: string,
    @CurrentUser('userId') userId: string,
  ) {
    await this.venueService.checkOut(userId, venueId);
    return ResponseBuilder.success(null, VENUE_MESSAGES.CHECK_OUT_SUCCESS);
  }

  @Patch(':id/owner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Assign a venue owner',
    description:
      'Assign a user as the owner of a venue and promote them to CAFE_MANAGER. Grants that user access to the venue analytics dashboard. Requires admin role.',
  })
  @ApiSuccessResponse(VenueResponseDto, {
    description: VENUE_MESSAGES.OWNER_ASSIGNED,
  })
  @ApiErrorResponse(404, VENUE_MESSAGES.OWNER_USER_NOT_FOUND)
  @ApiCommonErrorResponses()
  async assignVenueOwner(
    @Param('id') venueId: string,
    @Body() assignOwnerDto: AssignOwnerDto,
  ) {
    const venue = await this.venueService.assignOwner(
      venueId,
      assignOwnerDto.userId,
    );
    return ResponseBuilder.success(venue, VENUE_MESSAGES.OWNER_ASSIGNED);
  }

  @Post(':id/image')
  @UseGuards(JwtAuthGuard, RolesGuard, VenueOwnershipGuard, ThrottlerGuard)
  @Roles(Role.CAFE_MANAGER, Role.ADMIN)
  @ApiBearerAuth('jwt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upload or replace venue image',
    description:
      'Upload a new venue image or replace the existing one. Maximum file size: 5MB. Supported formats: JPEG, PNG, WebP. The old image is automatically deleted. Requires venue ownership or admin role.',
  })
  @ApiSuccessResponse(VenueImageUploadDto, {
    description: VENUE_MESSAGES.VENUE_IMAGE_UPLOADED,
  })
  @ApiErrorResponse(400, 'No file provided or invalid file type')
  @ApiErrorResponse(404, VENUE_MESSAGES.VENUE_NOT_FOUND)
  @ApiErrorResponse(413, 'Payload Too Large - File exceeds 5MB limit')
  @ApiCommonErrorResponses()
  @UseInterceptors(FileUploadInterceptor)
  @UploadFile({
    fieldName: 'venueImage',
    maxSize: 5 * 1024 * 1024, // 5MB
    description: 'Venue image file (JPEG, PNG, WebP)',
  })
  async uploadVenueImage(
    @Param('id') venueId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const image = await this.venueService.uploadVenueImage(venueId, file);
    return ResponseBuilder.success(image, VENUE_MESSAGES.VENUE_IMAGE_UPLOADED);
  }

  @Delete(':id/image')
  @UseGuards(JwtAuthGuard, RolesGuard, VenueOwnershipGuard)
  @Roles(Role.CAFE_MANAGER, Role.ADMIN)
  @ApiBearerAuth('jwt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete venue image',
    description:
      'Remove the current venue image. It is permanently deleted from cloud storage. Requires venue ownership or admin role.',
  })
  @ApiMessageResponse(200, VENUE_MESSAGES.VENUE_IMAGE_DELETED)
  @ApiErrorResponse(400, VENUE_MESSAGES.NO_VENUE_IMAGE_TO_DELETE)
  @ApiErrorResponse(404, VENUE_MESSAGES.VENUE_NOT_FOUND)
  async deleteVenueImage(@Param('id') venueId: string) {
    await this.venueService.deleteVenueImage(venueId);
    return ResponseBuilder.success(null, VENUE_MESSAGES.VENUE_IMAGE_DELETED);
  }

  @Post(':id/view')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  @ApiBearerAuth('jwt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record a venue view',
    description:
      'Record that the current user opened this venue card/detail. Feeds the views → visits conversion funnel in venue analytics.',
  })
  @ApiMessageResponse(200, VENUE_MESSAGES.VIEW_RECORDED)
  @ApiErrorResponse(404, VENUE_MESSAGES.VENUE_NOT_FOUND)
  async recordVenueView(
    @Param('id') venueId: string,
    @CurrentUser('userId') userId: string,
  ) {
    await this.venueService.recordView(userId, venueId);
    return ResponseBuilder.success(null, VENUE_MESSAGES.VIEW_RECORDED);
  }
}
