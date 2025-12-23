import { LookingFor } from '@prisma/client';

import { UserProfile } from '@/modules/profile/types/user-profile.type';

export type ProfileForFeed = Omit<
  UserProfile,
  'email' | 'preference' | 'createdAt' | 'updatedAt'
> & {
  lookingFor: LookingFor[] | null;
};
