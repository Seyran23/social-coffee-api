import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createId } from '@paralleldrive/cuid2';
import { Role, TokenType } from '@prisma/client';
import ms from 'ms';

import { JwtPayload } from '@/common/interfaces/auth/jwt-payload.interface';
import { JwtRefreshPayload } from '@/common/interfaces/auth/jwt-refresh-payload.interface';
import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { AUTH_MESSAGES } from '@/modules/auth/constants/auth-messages';
import { TokenPair } from '@/modules/auth/token/interfaces/token-pair.interface';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly database: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async generateTokens(
    userId: string,
    firstName: string,
    lastName: string,
    email: string,
    role: Role,
    deviceInfo?: string,
    ipAddress?: string,
  ): Promise<TokenPair> {
    const accessTokenPayload: JwtPayload = {
      sub: userId,
      firstName,
      lastName,
      email,
      role,
    };

    const refreshTokenId = createId();

    const refreshTokenPayload: JwtRefreshPayload = {
      ...accessTokenPayload,
      jti: refreshTokenId,
      tokenType: TokenType.REFRESH,
    };

    const accessToken = await this.jwtService.sign(accessTokenPayload, {
      secret: this.configService.get('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION'),
    });

    const refreshToken = await this.jwtService.sign(refreshTokenPayload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION'),
    });

    await this.saveRefreshToken(
      refreshTokenId,
      userId,
      refreshToken,
      deviceInfo,
      ipAddress,
    );

    this.logger.log(`Generated token pair for user: ${email}`);

    return { accessToken, refreshToken };
  }

  async refreshAccessToken(
    userId: string,
    oldRefreshToken: string,
  ): Promise<TokenPair> {
    const tokenRecord = await this.database.token.findFirst({
      where: {
        userId,
        token: oldRefreshToken,
        type: TokenType.REFRESH,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!tokenRecord) {
      this.logger.warn(`Invalid or expired refresh token for user: ${userId}`);
      throw new UnauthorizedException(AUTH_MESSAGES.REFRESH_TOKEN_NOT_FOUND);
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await this.generateTokens(
        tokenRecord.user.id,
        tokenRecord.user.firstName,
        tokenRecord.user.lastName,
        tokenRecord.user.email,
        tokenRecord.user.role,
        tokenRecord.deviceInfo ?? undefined,
        tokenRecord.ipAddress ?? undefined,
      );

    await this.deleteRefreshToken(tokenRecord.id);

    this.logger.log(`Refreshed tokens for user: ${tokenRecord.user.email}`);

    return { accessToken, refreshToken: newRefreshToken };
  }

  async generateResetPasswordToken(
    userId: string,
    email: string,
    ipAddress?: string,
    deviceInfo?: string,
  ): Promise<string> {
    const resetToken = this.jwtService.sign(
      { sub: userId, email, type: TokenType.RESET_PASSWORD },
      {
        secret: this.configService.getOrThrow('JWT_RESET_PASSWORD_SECRET'),
        expiresIn: this.configService.getOrThrow(
          'JWT_RESET_PASSWORD_EXPIRATION',
        ),
      },
    );

    const expirationInMs = ms(
      this.configService.getOrThrow('JWT_RESET_PASSWORD_EXPIRATION'),
    );
    const expiresAt = new Date(Date.now() + expirationInMs);

    await this.database.token.create({
      data: {
        userId,
        token: resetToken,
        type: TokenType.RESET_PASSWORD,
        ipAddress,
        deviceInfo,
        expiresAt,
      },
    });

    this.logger.log(`Generated reset password token for user: ${email}`);

    return resetToken;
  }

  async verifyResetPasswordToken(
    token: string,
  ): Promise<{ userId: string; email: string }> {
    const tokenRecord = await this.database.token.findFirst({
      where: {
        token,
        type: TokenType.RESET_PASSWORD,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!tokenRecord) {
      this.logger.warn('Invalid or expired reset password token');
      throw new BadRequestException(AUTH_MESSAGES.RESET_TOKEN_INVALID);
    }

    const payload = this.jwtService.verify(token, {
      secret: this.configService.get<string>('JWT_RESET_PASSWORD_SECRET'),
    });

    return {
      userId: payload.sub,
      email: payload.email,
    };
  }

  async deleteResetPasswordToken(token: string): Promise<void> {
    await this.database.token.deleteMany({
      where: {
        token,
        type: TokenType.RESET_PASSWORD,
      },
    });

    this.logger.log('Deleted reset password token');
  }

  async revokeRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    await this.database.token.deleteMany({
      where: {
        userId,
        token: refreshToken,
        type: TokenType.REFRESH,
      },
    });

    this.logger.log(`Revoked refresh token for user: ${userId}`);
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.database.token.deleteMany({
      where: {
        userId,
        type: TokenType.REFRESH,
      },
    });

    this.logger.log(`Revoked all refresh tokens for user: ${userId}`);
  }

  async cleanupExpiredTokens(): Promise<void> {
    const result = await this.database.token.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    this.logger.log(`Cleaned up ${result.count} expired tokens`);
  }

  private async saveRefreshToken(
    tokenId: string,
    userId: string,
    token: string,
    deviceInfo?: string,
    ipAddress?: string,
  ): Promise<void> {
    const expirationInMs = ms(
      this.configService.getOrThrow('JWT_REFRESH_EXPIRATION'),
    );
    const expiresAt = new Date(Date.now() + expirationInMs);

    await this.database.token.create({
      data: {
        id: tokenId,
        userId,
        token,
        type: TokenType.REFRESH,
        expiresAt,
        deviceInfo,
        ipAddress,
      },
    });
  }

  private async deleteRefreshToken(tokenId: string): Promise<void> {
    await this.database.token.delete({
      where: { id: tokenId },
    });
  }
}
