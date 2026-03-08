import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Role, TokenType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { AUTH_MESSAGES } from '@/modules/auth/constants/auth-messages';
import { TokenService } from '@/modules/auth/token/token.service';

describe('TokenService', () => {
  let tokenService: TokenService;
  let jwtService: JwtService;
  let prismaService: PrismaService;
  let configService: ConfigService;

  beforeEach(async () => {
    vi.mock('@paralleldrive/cuid2', () => ({
      createId: vi.fn().mockReturnValue('mock-cuid'),
    }));

    vi.mock('ms', () => ({
      default: vi.fn().mockReturnValue(10000), // 10 seconds mock
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        {
          provide: JwtService,
          useValue: {
            sign: vi.fn(),
            verify: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              const configMap: Record<string, string> = {
                JWT_ACCESS_SECRET: 'access-secret',
                JWT_ACCESS_EXPIRATION: '15m',
                JWT_REFRESH_SECRET: 'refresh-secret',
                JWT_REFRESH_EXPIRATION: '7d',
                JWT_RESET_PASSWORD_SECRET: 'reset-secret',
                JWT_RESET_PASSWORD_EXPIRATION: '15m',
              };
              return configMap[key];
            }),
            getOrThrow: vi.fn((key: string) => {
              const configMap: Record<string, string> = {
                JWT_ACCESS_SECRET: 'access-secret',
                JWT_ACCESS_EXPIRATION: '15m',
                JWT_REFRESH_SECRET: 'refresh-secret',
                JWT_REFRESH_EXPIRATION: '7d',
                JWT_RESET_PASSWORD_SECRET: 'reset-secret',
                JWT_RESET_PASSWORD_EXPIRATION: '15m',
              };
              return configMap[key];
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            token: {
              findFirst: vi.fn(),
              create: vi.fn(),
              delete: vi.fn(),
              deleteMany: vi.fn(),
            },
          },
        },
        {
          provide: LoggerService,
          useValue: {
            log: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
          },
        },
      ],
    }).compile();

    tokenService = module.get<TokenService>(TokenService);
    jwtService = module.get<JwtService>(JwtService);
    prismaService = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('generateTokens', () => {
    it('should generate access and refresh tokens and save refresh token', async () => {
      vi.spyOn(jwtService, 'sign')
        .mockResolvedValueOnce('mock-access-token' as never)
        .mockResolvedValueOnce('mock-refresh-token' as never);

      vi.spyOn(prismaService.token, 'create').mockResolvedValue({} as any);

      const result = await tokenService.generateTokens(
        'user-1',
        'John',
        'Doe',
        'john@test.com',
        Role.USER,
        'ios',
        '127.0.0.1',
      );

      expect(jwtService.sign).toHaveBeenCalledTimes(2); // once for access, once for refresh
      expect(prismaService.token.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          token: 'mock-refresh-token',
          type: TokenType.REFRESH,
          deviceInfo: 'ios',
          ipAddress: '127.0.0.1',
        }),
      });

      expect(result).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });
    });
  });

  describe('refreshAccessToken', () => {
    it('should throw UnauthorizedException if token not found or expired', async () => {
      vi.spyOn(prismaService.token, 'findFirst').mockResolvedValue(null);

      await expect(
        tokenService.refreshAccessToken('user-1', 'old-token'),
      ).rejects.toThrow(
        new UnauthorizedException(AUTH_MESSAGES.REFRESH_TOKEN_NOT_FOUND),
      );
    });

    it('should generate new tokens and delete the old one', async () => {
      const mockTokenRecord = {
        id: 'token-1',
        user: {
          id: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'test@example.com',
          role: Role.USER,
        },
        deviceInfo: 'ios',
        ipAddress: '127.0.0.1',
      };

      vi.spyOn(prismaService.token, 'findFirst').mockResolvedValue(
        mockTokenRecord as any,
      );

      vi.spyOn(jwtService, 'sign')
        .mockResolvedValueOnce('new-acc-token' as never)
        .mockResolvedValueOnce('new-ref-token' as never);

      const result = await tokenService.refreshAccessToken(
        'user-1',
        'old-token',
      );

      // Uses generateTokens underneath
      expect(prismaService.token.create).toHaveBeenCalled();
      // Deletes the old token
      expect(prismaService.token.delete).toHaveBeenCalledWith({
        where: { id: 'token-1' },
      });

      expect(result.accessToken).toBe('new-acc-token');
      expect(result.refreshToken).toBe('new-ref-token');
    });
  });

  describe('generateResetPasswordToken', () => {
    it('should generate token and store it', async () => {
      vi.spyOn(jwtService, 'sign').mockReturnValue('reset-jwt-token' as never);

      const result = await tokenService.generateResetPasswordToken(
        'user-1',
        'test@test.com',
        '127.0.0.1',
        'android',
      );

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'user-1', email: 'test@test.com' }),
        expect.any(Object),
      );

      expect(prismaService.token.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          token: 'reset-jwt-token',
          type: TokenType.RESET_PASSWORD,
        }),
      });

      expect(result).toBe('reset-jwt-token');
    });
  });

  describe('verifyResetPasswordToken', () => {
    it('should throw BadRequestException if token is not found in db', async () => {
      vi.spyOn(prismaService.token, 'findFirst').mockResolvedValue(null);

      await expect(
        tokenService.verifyResetPasswordToken('bad-token'),
      ).rejects.toThrow(
        new BadRequestException(AUTH_MESSAGES.RESET_TOKEN_INVALID),
      );
    });

    it('should return payload if token is valid', async () => {
      vi.spyOn(prismaService.token, 'findFirst').mockResolvedValue({
        id: 'token-id',
      } as any);
      vi.spyOn(jwtService, 'verify').mockReturnValue({
        sub: 'user-1',
        email: 'test@example.com',
      } as never);

      const result = await tokenService.verifyResetPasswordToken('good-token');

      expect(jwtService.verify).toHaveBeenCalledWith('good-token', {
        secret: 'reset-secret',
      });
      expect(result).toEqual({ userId: 'user-1', email: 'test@example.com' });
    });
  });

  describe('revokeRefreshToken', () => {
    it('should delete specified refresh token', async () => {
      await tokenService.revokeRefreshToken('user-1', 'ref-token');
      expect(prismaService.token.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          token: 'ref-token',
          type: TokenType.REFRESH,
        },
      });
    });
  });

  describe('revokeAllRefreshTokens', () => {
    it('should delete all refresh tokens for a user', async () => {
      await tokenService.revokeAllRefreshTokens('user-1');
      expect(prismaService.token.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          type: TokenType.REFRESH,
        },
      });
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should delete all tokens where expiresAt is past', async () => {
      vi.spyOn(prismaService.token, 'deleteMany').mockResolvedValue({
        count: 5,
      } as any);
      await tokenService.cleanupExpiredTokens();
      expect(prismaService.token.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });
  });
});
