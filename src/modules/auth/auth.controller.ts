import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import {
  ApiAllErrorResponses,
  ApiCommonErrorResponses,
  ApiMessageResponse,
  ApiSuccessResponse,
} from '@/common/decorators/swagger.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { JwtRefreshGuard } from '@/common/guards/jwt-refresh.guard';
import {
  clearRefreshTokenCookie,
  getRefreshToken,
  setRefreshTokenCookie,
} from '@/common/utils/cookie-utils';
import { ResponseBuilder } from '@/common/utils/response-builder';
import { AUTH_MESSAGES } from '@/modules/auth/constants/auth-messages';
import { ForgotPasswordDto } from '@/modules/auth/dto/request/forgot-password.dto';
import { LoginDto } from '@/modules/auth/dto/request/login.dto';
import { RegisterDto } from '@/modules/auth/dto/request/register.dto';
import { ResetPasswordDto } from '@/modules/auth/dto/request/reset-password.dto';
import { AuthResponseDto } from '@/modules/auth/dto/response/auth-response.dto';
import { JwtTokenResponseDto } from '@/modules/auth/dto/response/jwt-token-response.dto';
import { ResetTokenResponseDto } from '@/modules/auth/dto/response/reset-token-response.dto';

import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new user account',
    description:
      'Creates a new user account with email and password. Returns user data and access token. Refresh token is set as HTTP-only cookie.',
  })
  @ApiSuccessResponse(AuthResponseDto, {
    description: AUTH_MESSAGES.REGISTER_SUCCESS,
    status: 201,
  })
  @ApiAllErrorResponses()
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...responseData } =
      await this.authService.register(registerDto);

    setRefreshTokenCookie(res, refreshToken);

    return ResponseBuilder.success(
      responseData,
      AUTH_MESSAGES.REGISTER_SUCCESS,
    );
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in to an existing account',
    description:
      'Authenticates a user with email and password. Returns user data and access token. Refresh token is set as HTTP-only cookie.',
  })
  @ApiSuccessResponse(AuthResponseDto, {
    description: AUTH_MESSAGES.LOGIN_SUCCESS,
  })
  @ApiAllErrorResponses()
  async login(
    @Body() loginDto: LoginDto,
    @Ip() ipAddress: string,
    @Res({ passthrough: true })
    res: Response,
    @Req() req: Request,
  ) {
    const userAgent = req.headers['user-agent'];

    const { refreshToken, ...responseData } = await this.authService.login(
      loginDto,
      userAgent,
      ipAddress,
    );

    setRefreshTokenCookie(res, refreshToken);

    return ResponseBuilder.success(responseData, AUTH_MESSAGES.LOGIN_SUCCESS);
  }

  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refreshToken')
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Generates a new access token using the refresh token from cookie. Also rotates the refresh token for security.',
  })
  @ApiSuccessResponse(JwtTokenResponseDto, {
    description: AUTH_MESSAGES.TOKEN_REFRESHED_SUCCESS,
  })
  @ApiCommonErrorResponses()
  async refreshTokens(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser('userId') userId: string,
  ) {
    const oldRefreshToken = getRefreshToken(req);

    const { refreshToken: newRefreshToken, accessToken } =
      await this.authService.refreshTokens(userId, oldRefreshToken);

    setRefreshTokenCookie(res, newRefreshToken);

    return ResponseBuilder.success(
      { accessToken },
      AUTH_MESSAGES.TOKEN_REFRESHED_SUCCESS,
    );
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset',
    description:
      'Sends a password reset email to the user. For security, always returns success even if email does not exist.',
  })
  @ApiSuccessResponse(ResetTokenResponseDto, {
    description: AUTH_MESSAGES.FORGOT_PASSWORD_SUCCESS,
  })
  @ApiAllErrorResponses()
  async forgotPassword(
    @CurrentUser('userId') userId: string,
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    const userAgent = req.headers['user-agent'];

    const resetToken = await this.authService.forgotPassword(
      forgotPasswordDto,
      userId,
      ipAddress,
      userAgent,
    );

    return ResponseBuilder.success(
      resetToken ? { resetToken } : null,
      AUTH_MESSAGES.RESET_PASSWORD_GENERIC,
    );
  }

  @Post('reset-password/:token')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password using token',
    description:
      'Resets the user password using the token from email. Also signs out all active sessions.',
  })
  @ApiMessageResponse(200, AUTH_MESSAGES.PASSWORD_RESET_SUCCESS)
  @ApiAllErrorResponses()
  async resetPassword(
    @Param('token') token: string,
    @Body() resetPasswordDto: ResetPasswordDto,
  ) {
    await this.authService.resetPassword(token, resetPasswordDto);

    return ResponseBuilder.success(null, AUTH_MESSAGES.PASSWORD_RESET_SUCCESS);
  }

  @Post('logout')
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Sign out from all devices',
    description:
      'Invalidates all refresh tokens for the user. Signs out from all devices where user is logged in.',
  })
  @ApiMessageResponse(200, AUTH_MESSAGES.LOG_OUT_SUCCESS)
  @ApiCommonErrorResponses()
  async logout(
    @CurrentUser('userId') userId: string,
    @Res({ passthrough: true }) response: Response,
    @Req() req: Request,
  ) {
    const refreshToken = getRefreshToken(req);

    await this.authService.logOut(userId, refreshToken);

    clearRefreshTokenCookie(response);

    return ResponseBuilder.success(null, AUTH_MESSAGES.LOG_OUT_SUCCESS);
  }

  @Post('logout-all')
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Sign out from all devices',
    description:
      'Invalidates all refresh tokens for the user. Signs out from all devices where user is logged in.',
  })
  @ApiMessageResponse(200, AUTH_MESSAGES.LOG_OUT_ALL_DEVICES_SUCCESS)
  @ApiCommonErrorResponses()
  async logoutAllDevices(
    @CurrentUser('userId') userId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logOutAllDevices(userId);

    clearRefreshTokenCookie(response);

    return ResponseBuilder.success(
      null,
      AUTH_MESSAGES.LOG_OUT_ALL_DEVICES_SUCCESS,
    );
  }
}
