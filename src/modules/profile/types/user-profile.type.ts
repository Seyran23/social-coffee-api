import { Gender, Interest, LookingFor, User } from '@prisma/client';

export type UserProfile = Omit<
  User,
  'passwordHash' | 'role' | 'profileImagePublicId' | 'deletedAt'
> & {
  interests: Pick<Interest, 'id' | 'name'>[];
  preference: {
    minAge: number;
    maxAge: number;
    preferredGender: Gender;
    lookingFor: LookingFor[] | null;
  } | null;
};
