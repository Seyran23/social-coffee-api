import { VenueResponseDto } from '@/modules/venue/dto/response/venue-response.dto';

export interface VenuesWithPagination {
  venues: VenueResponseDto[];
  total: number;
  page: number;
  limit: number;
}
