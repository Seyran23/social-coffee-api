export const PROFILE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  birthDate: true,
  gender: true,
  bio: true,
  profileImageUrl: true,
  createdAt: true,
  updatedAt: true,
  userInterests: {
    include: {
      interest: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  preference: {
    select: {
      minAge: true,
      maxAge: true,
      preferredGender: true,
      lookingFor: true,
    },
  },
} as const;
