import { type Venue } from '@prisma/client';

export interface VenuesWithPagination {
  venues: Omit<Venue, 'imagePublicId'>[];
  total: number;
  page: number;
  limit: number;
}
