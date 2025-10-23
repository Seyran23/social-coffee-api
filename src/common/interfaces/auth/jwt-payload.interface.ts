import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
}
