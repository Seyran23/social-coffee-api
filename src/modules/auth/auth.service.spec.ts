import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { AuthService } from '@/modules/auth/auth.service';
import { AUTH_MESSAGES } from '@/modules/auth/constants/auth-messages';
import { TokenService } from '@/modules/auth/token/token.service';

vi.mock('bcrypt', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

describe('AuthService', () => {
  let authService: AuthService;
  let prismaService: PrismaService;
  let tokenService: TokenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: vi.fn(),
              create: vi.fn(),
              update: vi.fn(),
            },
          },
        },
        {
          provide: TokenService,
          useValue: {
            generateTokens: vi.fn(),
            refreshAccessToken: vi.fn(),
            revokeRefreshToken: vi.fn(),
            revokeAllRefreshTokens: vi.fn(),
            generateResetPasswordToken: vi.fn(),
            verifyResetPasswordToken: vi.fn(),
            deleteResetPasswordToken: vi.fn(),
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

    authService = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    tokenService = module.get<TokenService>(TokenService);

    vi.clearAllMocks();
  });

  describe('register', () => {
    const registerDto = {
      email: 'test@example.com',
      password: 'Password123!',
      firstName: 'John',
      lastName: 'Doe',
      birthDate: '1990-01-01',
      gender: 'MALE',
      bio: 'Hello world',
    } as any;

    it('should throw ConflictException if email exists', async () => {
      vi.spyOn(prismaService.user, 'findUnique').mockResolvedValue({
        id: 'existing-id',
      } as any);

      await expect(authService.register(registerDto)).rejects.toThrow(
        new ConflictException(AUTH_MESSAGES.EMAIL_ALREADY_EXISTS),
      );
    });

    it('should hash password, create user, and return tokens', async () => {
      vi.spyOn(prismaService.user, 'findUnique').mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed_password' as never);

      const mockCreatedUser = {
        id: 'new-user-id',
        email: registerDto.email,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        role: 'USER',
      };
      vi.spyOn(prismaService.user, 'create').mockResolvedValue(
        mockCreatedUser as any,
      );

      vi.spyOn(tokenService, 'generateTokens').mockResolvedValue({
        accessToken: 'access_tok',
        refreshToken: 'refresh_tok',
      });

      const result = await authService.register(registerDto);

      expect(bcrypt.hash).toHaveBeenCalledWith(
        registerDto.password,
        expect.any(Number),
      );
      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: {
          email: registerDto.email,
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
          gender: registerDto.gender,
          bio: registerDto.bio,
          passwordHash: 'hashed_password',
          birthDate: expect.any(Date),
        },
      });

      expect(result.accessToken).toBe('access_tok');
      expect(result.user.email).toBe(registerDto.email);
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should throw UnauthorizedException if user not found', async () => {
      vi.spyOn(prismaService.user, 'findUnique').mockResolvedValue(null);

      await expect(authService.login(loginDto)).rejects.toThrow(
        new UnauthorizedException(AUTH_MESSAGES.INVALID_CREDENTIALS),
      );
    });

    it('should throw UnauthorizedException if account is deleted', async () => {
      vi.spyOn(prismaService.user, 'findUnique').mockResolvedValue({
        id: 'user',
        deletedAt: new Date(),
      } as any);

      await expect(authService.login(loginDto)).rejects.toThrow(
        new UnauthorizedException(AUTH_MESSAGES.ACCOUNT_INACTIVE),
      );
    });

    it('should throw UnauthorizedException if password is wrong', async () => {
      vi.spyOn(prismaService.user, 'findUnique').mockResolvedValue({
        id: 'user',
        passwordHash: 'real_hash',
      } as any);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(authService.login(loginDto)).rejects.toThrow(
        new UnauthorizedException(AUTH_MESSAGES.INVALID_CREDENTIALS),
      );
    });

    it('should return tokens if login is successful', async () => {
      const mockUser = {
        id: 'user-1',
        email: loginDto.email,
        passwordHash: 'real_hash',
        firstName: 'John',
      };

      vi.spyOn(prismaService.user, 'findUnique').mockResolvedValue(
        mockUser as any,
      );
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.spyOn(tokenService, 'generateTokens').mockResolvedValue({
        accessToken: 'acc',
        refreshToken: 'ref',
      });

      const result = await authService.login(loginDto, 'device', '127.0.0.1');

      expect(result.accessToken).toBe('acc');
      expect(tokenService.generateTokens).toHaveBeenCalledWith(
        'user-1',
        mockUser.firstName,
        undefined, // lastName
        mockUser.email,
        undefined, // role
        'device',
        '127.0.0.1',
      );
    });
  });

  describe('logOutAllDevices', () => {
    it('should call tokenService to revoke all tokens', async () => {
      await authService.logOutAllDevices('user-1');
      expect(tokenService.revokeAllRefreshTokens).toHaveBeenCalledWith(
        'user-1',
      );
    });
  });

  describe('forgotPassword', () => {
    it('should return undefined if user is not found', async () => {
      vi.spyOn(prismaService.user, 'findUnique').mockResolvedValue(null);

      const result = await authService.forgotPassword(
        { email: 'fake@email.com' },
        'u1',
      );

      expect(result).toBeUndefined();
    });

    it('should return token if user is found', async () => {
      vi.spyOn(prismaService.user, 'findUnique').mockResolvedValue({
        id: 'u1',
        email: 'e',
      } as any);
      vi.spyOn(tokenService, 'generateResetPasswordToken').mockResolvedValue(
        'reset-token',
      );

      const result = await authService.forgotPassword({ email: 'e' }, 'u1');

      expect(result).toBe('reset-token');
    });
  });

  describe('resetPassword', () => {
    it('should hash new password, update db, and revoke tokens', async () => {
      vi.spyOn(tokenService, 'verifyResetPasswordToken').mockResolvedValue({
        userId: 'u1',
      } as any);
      vi.mocked(bcrypt.hash).mockResolvedValue('new_hash' as never);

      await authService.resetPassword('reset-token', {
        newPassword: 'NewPassword123!',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith(
        'NewPassword123!',
        expect.any(Number),
      );
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { passwordHash: 'new_hash' },
      });
      expect(tokenService.deleteResetPasswordToken).toHaveBeenCalledWith(
        'reset-token',
      );
      expect(tokenService.revokeAllRefreshTokens).toHaveBeenCalledWith('u1');
    });
  });
});
