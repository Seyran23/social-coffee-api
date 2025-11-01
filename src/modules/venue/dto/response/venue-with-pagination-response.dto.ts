import { ApiProperty } from '@nestjs/swagger';

import { VenueResponseDto } from './venue-response.dto';

export class PaginationMetaDto {
  @ApiProperty({
    description: 'Total number of venues',
    example: 45,
    type: Number,
  })
  total: number;

  @ApiProperty({
    description: 'Current page number',
    example: 1,
    type: Number,
  })
  page: number;

  @ApiProperty({
    description: 'Number of items per page',
    example: 10,
    type: Number,
  })
  limit: number;

  @ApiProperty({
    description: 'Total number of pages',
    example: 5,
    type: Number,
  })
  totalPages: number;

  @ApiProperty({
    description: 'Whether there is a next page',
    example: true,
    type: Boolean,
  })
  hasNextPage: boolean;

  @ApiProperty({
    description: 'Whether there is a previous page',
    example: false,
    type: Boolean,
  })
  hasPreviousPage: boolean;
}

export class VenuePaginationResponseDto {
  @ApiProperty({
    description: 'Indicates if the request was successful',
    example: true,
    type: Boolean,
  })
  success: boolean;

  @ApiProperty({
    description: 'HTTP status code',
    example: 200,
    type: Number,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Response message',
    example: 'Venues retrieved successfully',
    type: String,
    required: false,
  })
  message?: string;

  @ApiProperty({
    description: 'Array of venues',
    type: [VenueResponseDto],
    isArray: true,
  })
  data: VenueResponseDto[];

  @ApiProperty({
    description: 'Pagination information',
    type: PaginationMetaDto,
  })
  pagination: PaginationMetaDto;

  @ApiProperty({
    description: 'ISO 8601 timestamp of the response',
    example: '2024-01-15T10:30:00.000Z',
    type: String,
    format: 'date-time',
  })
  timestamp: string;
}
