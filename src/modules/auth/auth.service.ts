import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { plainToInstance } from 'class-transformer';

import { UserResponseDto } from '@/common/dtos/response/user-response.dto';
import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { AUTH_MESSAGES } from '@/modules/auth/constants/auth-messages';
import { SALT_ROUNDS } from '@/modules/auth/constants/salt-rounds';
import { ForgotPasswordDto } from '@/modules/auth/dto/request/forgot-password.dto';
import { LoginDto } from '@/modules/auth/dto/request/login.dto';
import { RegisterDto } from '@/modules/auth/dto/request/register.dto';
import { ResetPasswordDto } from '@/modules/auth/dto/request/reset-password.dto';
import { AuthResponseDto } from '@/modules/auth/dto/response/auth-response.dto';
import { JwtTokenResponseDto } from '@/modules/auth/dto/response/jwt-token-response.dto';
import { TokenService } from '@/modules/auth/token/token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly database: PrismaService,
    private readonly tokenService: TokenService,
    private readonly logger: LoggerService,
  ) {}

  async register(
    registerDto: RegisterDto,
  ): Promise<AuthResponseDto & { refreshToken: string }> {
    const { email, password, ...userData } = registerDto;

    const existingUser = await this.database.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException(AUTH_MESSAGES.EMAIL_ALREADY_EXISTS);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await this.database.user.create({
      data: {
        ...userData,
        email,
        passwordHash,
        birthDate: new Date(userData.birthDate),
      },
    });

    this.logger.log(`User registered: ${user.email}`);

    const userDto = plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });

    const { accessToken, refreshToken } =
      await this.tokenService.generateTokens(
        user.id,
        user.firstName,
        user.lastName,
        user.email,
        user.role,
      );

    return {
      user: userDto,
      accessToken,
      refreshToken,
    };
  }

  async login(
    loginDto: LoginDto,
    deviceInfo?: string,
    ipAddress?: string,
  ): Promise<
    AuthResponseDto & {
      refreshToken: string;
    }
  > {
    const { email, password } = loginDto;

    const user = await this.database.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException(AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    if (user.deletedAt) {
      throw new UnauthorizedException(AUTH_MESSAGES.ACCOUNT_INACTIVE);
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException(AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    this.logger.log(`User signed in: ${user.email}`);

    const userDto = plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });

    const { accessToken, refreshToken } =
      await this.tokenService.generateTokens(
        user.id,
        user.firstName,
        user.lastName,
        user.email,
        user.role,
        deviceInfo,
        ipAddress,
      );

    return {
      user: userDto,
      accessToken,
      refreshToken,
    };
  }

  async refreshTokens(
    userId: string,
    oldRefreshToken: string,
  ): Promise<JwtTokenResponseDto & { refreshToken: string }> {
    const { accessToken, refreshToken } =
      await this.tokenService.refreshAccessToken(userId, oldRefreshToken);

    return {
      accessToken,
      refreshToken,
    };
  }

  async logOut(userId: string, refreshToken: string): Promise<void> {
    await this.tokenService.revokeRefreshToken(userId, refreshToken);

    this.logger.log(`User signed out: ${userId}`);
  }

  async logOutAllDevices(userId: string): Promise<{ message: string }> {
    await this.tokenService.revokeAllRefreshTokens(userId);

    this.logger.log(`User signed out from all devices: ${userId}`);

    return {
      message: 'Signed out from all devices successfully',
    };
  }

  async forgotPassword(
    forgotPasswordDto: ForgotPasswordDto,
    userId: string,
    ipAddress?: string,
    deviceInfo?: string,
  ): Promise<string | undefined> {
    const { email } = forgotPasswordDto;

    const user = await this.database.user.findUnique({
      where: { id: userId, email },
    });

    if (!user) {
      this.logger.warn(
        `Password reset requested for non-existent email: ${email}`,
      );
      return;
    }

    const resetToken = await this.tokenService.generateResetPasswordToken(
      user.id,
      user.email,
      ipAddress,
      deviceInfo,
    );

    this.logger.log(`Password reset token generated for: ${user.email}`);

    return resetToken;
  }

  async resetPassword(
    resetToken: string,
    resetPasswordDto: ResetPasswordDto,
  ): Promise<void> {
    const { newPassword } = resetPasswordDto;

    const { userId } =
      await this.tokenService.verifyResetPasswordToken(resetToken);

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await this.database.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await this.tokenService.deleteResetPasswordToken(resetToken);

    await this.tokenService.revokeAllRefreshTokens(userId);

    this.logger.log(`Password reset for user: ${userId}`);
  }
}
