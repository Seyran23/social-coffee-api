import { Body, Controller, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { Roles } from '@/common/decorators/roles.decorator';
import {
  ApiAllErrorResponses,
  ApiSuccessResponse,
} from '@/common/decorators/swagger.decorator';
import { UserResponseDto } from '@/common/dtos/response/user-response.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { ResponseBuilder } from '@/common/utils/response-builder';
import { USER_MESSAGES } from '@/modules/user/constants/messages';
import { CreateUserDto } from '@/modules/user/dto/request/create-user.dto';
import { UserService } from '@/modules/user/user.service';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Create a user',
    description:
      'Create a new user account (e.g. a cafe manager). Unlike /auth/register, this does not sign the admin out — no tokens or cookies are issued for the created account. Requires admin role. Cannot create ADMIN accounts.',
  })
  @ApiSuccessResponse(UserResponseDto, {
    description: USER_MESSAGES.USER_CREATED,
    status: 201,
  })
  @ApiAllErrorResponses()
  async createUser(@Body() createUserDto: CreateUserDto) {
    const user = await this.userService.createUser(createUserDto);
    return ResponseBuilder.success(
      user,
      USER_MESSAGES.USER_CREATED,
      HttpStatus.CREATED,
    );
  }
}
