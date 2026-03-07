import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import {
    ApiAllErrorResponses,
    ApiCommonErrorResponses,
    ApiErrorResponse,
    ApiMessageResponse,
    ApiSuccessResponse,
} from '@/common/decorators/swagger.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { ResponseBuilder } from '@/common/utils/response-builder';
import { INTERACTION_MESSAGES } from '@/modules/interaction/constants/messages';
import { LikeUserDto } from '@/modules/interaction/dto/request/like-user.dto';
import { InteractionResponseDto } from '@/modules/interaction/dto/response/interaction-response.dto';
import { MatchResultResponseDto } from '@/modules/interaction/dto/response/match-result-response.dto';
import { InteractionService } from '@/modules/interaction/interaction.service';

@ApiTags('Interactions')
@Controller('interactions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER)
@ApiBearerAuth('jwt')
export class InteractionController {
    constructor(private readonly interactionService: InteractionService) { }

    @Post('like')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
        summary: 'Like a user at a venue',
        description:
            'Like another user at the same venue. If the target user has already liked you, a mutual match is detected and a 10-minute chat session is created.',
    })
    @ApiSuccessResponse(MatchResultResponseDto, {
        description: INTERACTION_MESSAGES.LIKE_SUCCESS,
        status: 201,
    })
    @ApiErrorResponse(400, INTERACTION_MESSAGES.SELF_LIKE)
    @ApiErrorResponse(400, INTERACTION_MESSAGES.NOT_AT_VENUE)
    @ApiErrorResponse(409, INTERACTION_MESSAGES.ALREADY_LIKED)
    @ApiAllErrorResponses()
    async likeUser(
        @CurrentUser('userId') userId: string,
        @Body() likeUserDto: LikeUserDto,
    ) {
        const result = await this.interactionService.likeUser(
            userId,
            likeUserDto.targetUserId,
            likeUserDto.venueId,
        );

        const message = result.matched
            ? INTERACTION_MESSAGES.MATCH_FOUND
            : INTERACTION_MESSAGES.LIKE_SUCCESS;

        return ResponseBuilder.success(result, message, HttpStatus.CREATED);
    }

    @Delete('unlike/:targetUserId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Unlike a user',
        description:
            'Remove your like for a user at your current venue.',
    })
    @ApiMessageResponse(200, INTERACTION_MESSAGES.UNLIKE_SUCCESS)
    @ApiCommonErrorResponses()
    async unlikeUser(
        @CurrentUser('userId') userId: string,
        @Param('targetUserId') targetUserId: string,
    ) {
        await this.interactionService.unlikeUser(userId, targetUserId);
        return ResponseBuilder.success(null, INTERACTION_MESSAGES.UNLIKE_SUCCESS);
    }

    @Get('my-likes')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Get users I liked',
        description:
            'Get a list of users you have liked at your current venue.',
    })
    @ApiSuccessResponse(InteractionResponseDto, {
        description: INTERACTION_MESSAGES.MY_LIKES_RETRIEVED,
        isArray: true,
    })
    @ApiCommonErrorResponses()
    async getMyLikes(@CurrentUser('userId') userId: string) {
        const likes = await this.interactionService.getMyLikes(userId);
        return ResponseBuilder.success(
            likes,
            INTERACTION_MESSAGES.MY_LIKES_RETRIEVED,
        );
    }

    @Get('liked-me')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Get users who liked me',
        description:
            'Get a list of users who have liked you at your current venue.',
    })
    @ApiSuccessResponse(InteractionResponseDto, {
        description: INTERACTION_MESSAGES.LIKED_ME_RETRIEVED,
        isArray: true,
    })
    @ApiCommonErrorResponses()
    async getLikedMe(@CurrentUser('userId') userId: string) {
        const likes = await this.interactionService.getLikedMe(userId);
        return ResponseBuilder.success(
            likes,
            INTERACTION_MESSAGES.LIKED_ME_RETRIEVED,
        );
    }
}
