import { Role } from '@prisma/client';

export interface RequestUser {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
}
