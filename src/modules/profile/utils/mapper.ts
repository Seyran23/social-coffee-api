import { Prisma } from '@prisma/client';

import { ProfileForFeed } from '@/modules/profile/types/profile-for-feed.type';
import { UserProfile } from '@/modules/profile/types/user-profile.type';

// Shape produced by `select: { ...PROFILE_SELECT, email: true }`.
type UserWithProfileShape = Prisma.UserGetPayload<{
  select: {
    id: true;
    firstName: true;
    lastName: true;
    email: true;
    birthDate: true;
    gender: true;
    bio: true;
    profileImageUrl: true;
    createdAt: true;
    updatedAt: true;
    userInterests: {
      include: { interest: { select: { id: true; name: true } } };
    };
    preference: {
      select: {
        minAge: true;
        maxAge: true;
        preferredGender: true;
        lookingFor: true;
      };
    };
  };
}>;

export const mapToProfile = (user: UserWithProfileShape) => {
  const interests = user.userInterests?.map(ui => ui.interest) ?? [];

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    birthDate: user.birthDate,
    gender: user.gender,
    bio: user.bio,
    profileImageUrl: user.profileImageUrl,
    interests,
    preference: user.preference,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

export const mapToProfileForFeed = (profile: UserProfile): ProfileForFeed => {
  const lookingFor = profile.preference?.lookingFor ?? null;

  return {
    id: profile.id,
    firstName: profile.firstName,
    lastName: profile.lastName,
    birthDate: profile.birthDate,
    gender: profile.gender,
    bio: profile.bio,
    profileImageUrl: profile.profileImageUrl,
    interests: profile.interests,
    lookingFor,
  };
};
