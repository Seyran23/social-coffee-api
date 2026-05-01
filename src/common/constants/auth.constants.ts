import { CookieOptions } from 'express';

export const ROLES_KEY = 'roles';

export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
const allowInsecureCookies = process.env.INSECURE_COOKIES_DEV_ONLY === 'true';

export const REFRESH_TOKEN_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: !allowInsecureCookies,
  sameSite: 'strict',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};
