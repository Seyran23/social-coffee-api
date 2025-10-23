import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { TokenType } from '@prisma/client';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { JwtRefreshPayload } from '@/common/interfaces/auth/jwt-refresh-payload.interface';
import { getRefreshToken } from '@/common/utils/cookie-utils';
import { PrismaService } from '@/database/prisma.service';
import { AUTH_MESSAGES } from '@/modules/auth/constants/auth-messages';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private readonly configService: ConfigService,
    private readonly database: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => getRefreshToken(req) ?? null,
      ]),
      secretOrKey: configService.get<string>('JWT_REFRESH_SECRET')!,
      ignoreExpiration: false,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtRefreshPayload) {
    const refreshToken = getRefreshToken(req);

    if (!refreshToken) {
      throw new UnauthorizedException(AUTH_MESSAGES.REFRESH_TOKEN_NOT_FOUND);
    }

    const tokenRecord = await this.database.token.findUnique({
      where: {
        id: payload.jti,
        userId: payload.sub,
        type: TokenType.REFRESH,
      },
      include: { user: true },
    });

    if (!tokenRecord?.user || tokenRecord.user.deletedAt) {
      throw new UnauthorizedException(
        AUTH_MESSAGES.INVALID_TOKEN_OR_USER_DEACTIVATED,
      );
    }

    return {
      userId: payload.sub,
      refreshTokenId: tokenRecord.id,
    };
  }
}
