import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import {
  ApiCommonErrorResponses,
  ApiSuccessResponse,
} from '@/common/decorators/swagger.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { ResponseBuilder } from '@/common/utils/response-builder';
import { ChatService } from '@/modules/chat/chat.service';
import { ChatSessionResponseDto } from '@/modules/chat/dto/response/chat-session-response.dto';

@ApiTags('Chat')
@Controller('chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER)
@ApiBearerAuth('jwt')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get my active chat sessions',
    description: 'Get all active chat sessions (matches) for the current user',
  })
  @ApiSuccessResponse(ChatSessionResponseDto, {
    description: 'Active chat sessions retrieved successfully',
    isArray: true,
  })
  @ApiCommonErrorResponses()
  async getMyChatSessions(
    @CurrentUser('userId') userId: string,
    @Query('venueId') venueId?: string,
  ) {
    const sessions = await this.chatService.getMyChatSessions(userId, venueId);
    return ResponseBuilder.success(
      sessions,
      'Chat sessions retrieved successfully',
    );
  }
}
