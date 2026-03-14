import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as cookieUtils from '@/common/utils/cookie-utils';
import { ResponseBuilder } from '@/common/utils/response-builder';
import { AuthController } from '@/modules/auth/auth.controller';
import { AuthService } from '@/modules/auth/auth.service';
import { AUTH_MESSAGES } from '@/modules/auth/constants/auth-messages';

vi.mock('@/common/utils/cookie-utils', () => ({
  setRefreshTokenCookie: vi.fn(),
  clearRefreshTokenCookie: vi.fn(),
  getRefreshToken: vi.fn(),
}));

describe('AuthController', () => {
  let authController: AuthController;
  let authService: AuthService;

  const mockResponse = {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response;

  const mockRequest = {
    headers: {
      'user-agent': 'test-agent',
    },
    cookies: {},
  } as unknown as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: vi.fn(),
            login: vi.fn(),
            refreshTokens: vi.fn(),
            forgotPassword: vi.fn(),
            resetPassword: vi.fn(),
            logOut: vi.fn(),
            logOutAllDevices: vi.fn(),
          },
        },
      ],
    }).compile();

    authController = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);

    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('register', () => {
    it('should register user, set cookie, and return success', async () => {
      const registerDto: any = { email: 'test@test.com', password: 'pass' };
      const authServiceResult = {
        refreshToken: 'refresh-token',
        accessToken: 'access-token',
        user: { id: '1', email: 'test@test.com' },
      };

      vi.spyOn(authService, 'register').mockResolvedValue(
        authServiceResult as any,
      );

      const result = await authController.register(registerDto, mockResponse);

      expect(authService.register).toHaveBeenCalledWith(registerDto);
      expect(cookieUtils.setRefreshTokenCookie).toHaveBeenCalledWith(
        mockResponse,
        'refresh-token',
      );
      expect(result).toEqual(
        ResponseBuilder.success(
          { accessToken: 'access-token', user: authServiceResult.user },
          AUTH_MESSAGES.REGISTER_SUCCESS,
        ),
      );
    });
  });

  describe('login', () => {
    it('should login, set cookie, and return success', async () => {
      const loginDto: any = { email: 'test@test.com', password: 'pass' };
      const authServiceResult = {
        refreshToken: 'refresh-token',
        accessToken: 'access-token',
        user: { id: '1', email: 'test@test.com' },
      };

      vi.spyOn(authService, 'login').mockResolvedValue(
        authServiceResult as any,
      );

      const result = await authController.login(
        loginDto,
        '127.0.0.1',
        mockResponse,
        mockRequest,
      );

      expect(authService.login).toHaveBeenCalledWith(
        loginDto,
        'test-agent',
        '127.0.0.1',
      );
      expect(cookieUtils.setRefreshTokenCookie).toHaveBeenCalledWith(
        mockResponse,
        'refresh-token',
      );
      expect(result).toEqual(
        ResponseBuilder.success(
          { accessToken: 'access-token', user: authServiceResult.user },
          AUTH_MESSAGES.LOGIN_SUCCESS,
        ),
      );
    });
  });

  describe('refreshTokens', () => {
    it('should refresh tokens, set new cookie, and return access token', async () => {
      vi.mocked(cookieUtils.getRefreshToken).mockReturnValue(
        'old-refresh-token',
      );

      vi.spyOn(authService, 'refreshTokens').mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      } as any);

      const result = await authController.refreshTokens(
        mockRequest,
        mockResponse,
        'user-1',
      );

      expect(cookieUtils.getRefreshToken).toHaveBeenCalledWith(mockRequest);
      expect(authService.refreshTokens).toHaveBeenCalledWith(
        'user-1',
        'old-refresh-token',
      );
      expect(cookieUtils.setRefreshTokenCookie).toHaveBeenCalledWith(
        mockResponse,
        'new-refresh',
      );
      expect(result).toEqual(
        ResponseBuilder.success(
          { accessToken: 'new-access' },
          AUTH_MESSAGES.TOKEN_REFRESHED_SUCCESS,
        ),
      );
    });
  });

  describe('forgotPassword', () => {
    it('should return reset token if forgot password succeeds', async () => {
      const forgotPasswordDto: any = { email: 'test@test.com' };
      vi.spyOn(authService, 'forgotPassword').mockResolvedValue('reset-token');

      const result = await authController.forgotPassword(
        'user-1',
        forgotPasswordDto,
        '127.0.0.1',
        mockRequest,
      );

      expect(authService.forgotPassword).toHaveBeenCalledWith(
        forgotPasswordDto,
        'user-1',
        '127.0.0.1',
        'test-agent',
      );
      expect(result).toEqual(
        ResponseBuilder.success(
          { resetToken: 'reset-token' },
          AUTH_MESSAGES.RESET_PASSWORD_GENERIC,
        ),
      );
    });

    it('should return null payload if token undefined (security)', async () => {
      const forgotPasswordDto: any = { email: 'test@test.com' };
      vi.spyOn(authService, 'forgotPassword').mockResolvedValue(undefined);

      const result = await authController.forgotPassword(
        'user-1',
        forgotPasswordDto,
        '127.0.0.1',
        mockRequest,
      );

      expect(result).toEqual(
        ResponseBuilder.success(null, AUTH_MESSAGES.RESET_PASSWORD_GENERIC),
      );
    });
  });

  describe('resetPassword', () => {
    it('should call reset password and return success payload', async () => {
      const dto: any = { newPassword: 'NewPassword123!' };
      const result = await authController.resetPassword('token-123', dto);

      expect(authService.resetPassword).toHaveBeenCalledWith('token-123', dto);
      expect(result).toEqual(
        ResponseBuilder.success(null, AUTH_MESSAGES.PASSWORD_RESET_SUCCESS),
      );
    });
  });

  describe('logout', () => {
    it('should call logout on service, clear cookie, and return success', async () => {
      vi.mocked(cookieUtils.getRefreshToken).mockReturnValue('active-refresh');

      const result = await authController.logout(
        'user-1',
        mockResponse,
        mockRequest,
      );

      expect(cookieUtils.getRefreshToken).toHaveBeenCalledWith(mockRequest);
      expect(authService.logOut).toHaveBeenCalledWith(
        'user-1',
        'active-refresh',
      );
      expect(cookieUtils.clearRefreshTokenCookie).toHaveBeenCalledWith(
        mockResponse,
      );
      expect(result).toEqual(
        ResponseBuilder.success(null, AUTH_MESSAGES.LOG_OUT_SUCCESS),
      );
    });
  });

  describe('logoutAllDevices', () => {
    it('should call logoutAllDevices on service, clear cookie, and return success', async () => {
      const result = await authController.logoutAllDevices(
        'user-1',
        mockResponse,
      );

      expect(authService.logOutAllDevices).toHaveBeenCalledWith('user-1');
      expect(cookieUtils.clearRefreshTokenCookie).toHaveBeenCalledWith(
        mockResponse,
      );
      expect(result).toEqual(
        ResponseBuilder.success(
          null,
          AUTH_MESSAGES.LOG_OUT_ALL_DEVICES_SUCCESS,
        ),
      );
    });
  });
});
