import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import {
  ApiErrorResponse,
  ApiMessageResponse,
  ApiSuccessResponse,
  ApiValidationErrorResponse,
} from '@/common/decorators/swagger.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { ResponseBuilder } from '@/common/utils/response-builder';
import { UploadFile } from '@/modules/file-upload/decorators/upload-file.decorator';
import { FileUploadInterceptor } from '@/modules/file-upload/interceptors/file-upload.interceptor';
import { PROFILE_MESSAGES } from '@/modules/profile/constants/messages';
import { DiscoverQueryDto } from '@/modules/profile/dto/request/discover-query.dto';
import { UpdateProfileDto } from '@/modules/profile/dto/request/update-profile.dto';
import { PaginatedFeedDto } from '@/modules/profile/dto/response/paginated-feed.dto';
import { ProfileImageUploadDto } from '@/modules/profile/dto/response/profile-image-upload.dto';
import { ProfileResponseDto } from '@/modules/profile/dto/response/profile-repsonse.dto';
import { ProfileService } from '@/modules/profile/profile.service';

@ApiTags('Profiles')
@Controller('profiles')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get own profile',
    description:
      "Retrieve the authenticated user's complete profile information including interests",
  })
  @ApiSuccessResponse(ProfileResponseDto, {
    description: 'Profile retrieved successfully',
    status: 200,
  })
  @ApiErrorResponse(404, 'User not found')
  async getMyProfile(@CurrentUser('userId') userId: string) {
    const profile = await this.profileService.getMyProfile(userId);
    return ResponseBuilder.success(
      profile,
      PROFILE_MESSAGES.PROFILE_FETCHED,
      HttpStatus.OK,
    );
  }

  @Get('feed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Discover profiles at current venue',
    description: 'Get paginated list of compatible users at your current venue',
  })
  @ApiSuccessResponse(PaginatedFeedDto, {
    description: 'Profile retrieved successfully',
    status: 200,
  })
  @ApiResponse({
    status: 400,
    description: 'Not checked in to any venue',
  })
  async discoverProfiles(
    @CurrentUser('userId') userId: string,
    @Query() query: DiscoverQueryDto,
  ) {
    const feed = await this.profileService.discoverProfiles(
      userId,
      query.limit,
      query.cursor,
    );

    return ResponseBuilder.success(feed, PROFILE_MESSAGES.PROFILE_FEED_FETCHED);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update own profile',
    description:
      "Update authenticated user's profile information. All fields are optional. Interests will be replaced if interestIds is provided.",
  })
  @ApiSuccessResponse(ProfileResponseDto, {
    description: 'Profile updated successfully',
    status: 200,
  })
  @ApiValidationErrorResponse()
  @ApiErrorResponse(404, 'User not found')
  async updateMyProfile(
    @CurrentUser('userId') userId: string,
    @Body() updateDto: UpdateProfileDto,
  ) {
    const profile = await this.profileService.updateMyProfile(
      userId,
      updateDto,
    );
    return ResponseBuilder.success(
      profile,
      PROFILE_MESSAGES.PROFILE_UPDATED,
      HttpStatus.OK,
    );
  }

  @Post('me/image')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @ApiOperation({
    summary: 'Upload or replace profile image',
    description:
      'Upload a new profile image or replace existing one. Maximum file size: 5MB. Supported formats: JPEG, PNG, WebP. Old image will be automatically deleted.',
  })
  @ApiSuccessResponse(ProfileImageUploadDto, {
    description: 'Profile image uploaded successfully',
    status: 200,
  })
  @ApiErrorResponse(400, 'No file provided or invalid file type')
  @ApiErrorResponse(404, 'User not found')
  @ApiErrorResponse(413, 'Payload Too Large - File exceeds 5MB limit')
  @ApiErrorResponse(429, 'Too Many Requests - Rate limit exceeded')
  @UseInterceptors(FileUploadInterceptor)
  @UploadFile({
    fieldName: 'profileImage',
    maxSize: 5 * 1024 * 1024, // 5MB
    description: 'Profile image file (JPEG, PNG, WebP)',
  })
  async uploadProfileImage(
    @CurrentUser('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(PROFILE_MESSAGES.NO_FILE_PROVIDED);
    }

    const profileImageUrl = await this.profileService.uploadProfileImage(
      userId,
      file,
    );

    return ResponseBuilder.success(
      profileImageUrl,
      PROFILE_MESSAGES.IMAGE_UPLOADED,
      HttpStatus.OK,
    );
  }

  @Delete('me/image')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete profile image',
    description:
      'Remove the current profile image. The image will be permanently deleted from cloud storage.',
  })
  @ApiMessageResponse(200, PROFILE_MESSAGES.IMAGE_DELETED)
  @ApiErrorResponse(400, 'No profile image to delete')
  @ApiErrorResponse(404, 'User not found')
  async deleteProfileImage(@CurrentUser('userId') userId: string) {
    await this.profileService.deleteProfileImage(userId);

    return ResponseBuilder.success(
      null,
      PROFILE_MESSAGES.IMAGE_DELETED,
      HttpStatus.OK,
    );
  }
}
