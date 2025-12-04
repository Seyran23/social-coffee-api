import { type Venue } from '@prisma/client';

export interface VenuesWithPagination {
  venues: Venue[];
  total: number;
  page: number;
  limit: number;
}
