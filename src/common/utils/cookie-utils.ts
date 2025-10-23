import { Request, Response } from 'express';

import {
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_OPTIONS,
} from '@/common/constants/auth.constants';

export function getRefreshToken(req: Request) {
  return req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];
}

export function setRefreshTokenCookie(res: Response, token: string) {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, token, REFRESH_TOKEN_COOKIE_OPTIONS);
}

export function clearRefreshTokenCookie(res: Response) {
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
    ...REFRESH_TOKEN_COOKIE_OPTIONS,
    maxAge: 0,
  });
}
