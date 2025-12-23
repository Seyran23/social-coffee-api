import { ProfileForFeed } from '@/modules/profile/types/profile-for-feed.type';
import { UserProfile } from '@/modules/profile/types/user-profile.type';

export const mapToProfile = (user: any) => {
  const interests = user.userInterests?.map((ui: any) => ui.interest) ?? [];

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
