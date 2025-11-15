import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import {
  ApiAllErrorResponses,
  ApiCommonErrorResponses,
  ApiMessageResponse,
  ApiSuccessResponse,
} from '@/common/decorators/swagger.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { ResponseBuilder } from '@/common/utils/response-builder';
import { PREFERENCE_MESSAGES } from '@/modules/preference/constants/messages';
import { UpdatePreferenceDto } from '@/modules/preference/dto/request/update-preference.dto';
import { PreferenceExistsResponseDto } from '@/modules/preference/dto/response/preference-exists-response.dto';
import { PreferenceResponseDto } from '@/modules/preference/dto/response/preference-response.dto';
import { PreferenceService } from '@/modules/preference/preference.service';

@ApiTags('Preferences')
@Controller('preferences')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class PreferenceController {
  constructor(private readonly preferenceService: PreferenceService) {}

  @Get('me/exists')
  @ApiOperation({
    summary: 'Check if preferences exist',
    description: 'Check if current user has set their preferences',
  })
  @ApiSuccessResponse(PreferenceExistsResponseDto, {
    description: PREFERENCE_MESSAGES.PREFERENCE_EXISTS,
    status: 200,
  })
  @ApiCommonErrorResponses()
  async checkExists(@CurrentUser('userId') userId: string) {
    const exists = await this.preferenceService.exists(userId);
    return ResponseBuilder.success(
      { exists },
      PREFERENCE_MESSAGES.PREFERENCE_EXISTS,
    );
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get my preferences',
    description: 'Get current user preferences',
  })
  @ApiSuccessResponse(PreferenceResponseDto, {
    description: PREFERENCE_MESSAGES.PREFERENCE_FOUND,
    status: 200,
  })
  @ApiResponse({
    status: 404,
    description: PREFERENCE_MESSAGES.PREFERENCE_NOT_FOUND,
  })
  @ApiCommonErrorResponses()
  async getMyPreferences(@CurrentUser('userId') userId: string) {
    const preference = await this.preferenceService.getMyPreferences(userId);
    return ResponseBuilder.success(
      preference,
      PREFERENCE_MESSAGES.PREFERENCE_FOUND,
    );
  }

  @Put('me')
  @ApiOperation({
    summary: 'Create or update preferences',
    description: 'Create new preferences or update existing ones',
  })
  @ApiSuccessResponse(PreferenceResponseDto, {
    description: PREFERENCE_MESSAGES.PREFERENCE_UPDATED,
    status: 200,
  })
  @ApiResponse({
    status: 400,
    description: PREFERENCE_MESSAGES.INVALID_PREFERENCE_DATA,
  })
  @ApiAllErrorResponses()
  async upsertPreferences(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdatePreferenceDto,
  ) {
    const newPreference = await this.preferenceService.upsertPreferences(
      userId,
      dto,
    );
    return ResponseBuilder.success(
      newPreference,
      PREFERENCE_MESSAGES.PREFERENCE_UPDATED,
    );
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete preferences',
    description: 'Reset preferences to default values',
  })
  @ApiMessageResponse(200, PREFERENCE_MESSAGES.PREFERENCE_DELETED)
  @ApiResponse({
    status: 404,
    description: PREFERENCE_MESSAGES.PREFERENCE_NOT_FOUND,
  })
  @ApiCommonErrorResponses()
  async deletePreferences(@CurrentUser('userId') userId: string) {
    await this.preferenceService.deletePreferences(userId);
    return ResponseBuilder.success(
      null,
      PREFERENCE_MESSAGES.PREFERENCE_DELETED,
    );
  }
}
