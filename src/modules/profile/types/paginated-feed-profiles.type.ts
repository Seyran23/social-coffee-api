import { ProfileForFeed } from '@/modules/profile/types/profile-for-feed.type';

export type ProfilesForFeedPaginated = {
  profiles: ProfileForFeed[];
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
};
