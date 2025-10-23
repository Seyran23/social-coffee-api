import { TokenType } from '@prisma/client';

import { JwtPayload } from '@/common/interfaces/auth/jwt-payload.interface';

export interface JwtRefreshPayload extends JwtPayload {
  jti: string;
  tokenType: TokenType;
}
