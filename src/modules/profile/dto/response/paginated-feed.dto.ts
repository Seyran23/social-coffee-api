import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

import { ProfileForFeedDto } from '@/modules/profile/dto/response/profile-for-feed.dto';

export class PaginatedFeedDto {
  @ApiProperty({
    description: 'List of profiles in the feed',
    type: [ProfileForFeedDto],
    isArray: true,
    example: [
      {
        id: '123e4567-e89b-12d3-a456-426614174000',
        firstName: 'Sarah',
        lastName: 'Johnson',
        birthDate: '1998-03-22T00:00:00.000Z',
        gender: 'FEMALE',
        bio: '🎨 Digital artist & coffee enthusiast ☕',
        profileImageUrl:
          'https://res.cloudinary.com/demo/image/upload/v1234567890/profiles/sarah.jpg',
        interests: [
          { id: '550e8400-e29b-41d4-a716-446655440000', name: 'Photography' },
          { id: '660e8400-e29b-41d4-a716-446655440001', name: 'Travel' },
          { id: '770e8400-e29b-41d4-a716-446655440002', name: 'Coffee' },
        ],
        lookingFor: ['FRIENDSHIP', 'CASUAL_DATING'],
      },
      {
        id: '223e4567-e89b-12d3-a456-426614174001',
        firstName: 'Michael',
        lastName: 'Chen',
        birthDate: '1995-07-15T00:00:00.000Z',
        gender: 'MALE',
        bio: '🏃‍♂️ Runner | 📚 Bookworm | ☕ Coffee addict',
        profileImageUrl:
          'https://res.cloudinary.com/demo/image/upload/v1234567890/profiles/michael.jpg',
        interests: [
          { id: '880e8400-e29b-41d4-a716-446655440003', name: 'Running' },
          { id: '990e8400-e29b-41d4-a716-446655440004', name: 'Reading' },
        ],
        lookingFor: ['FRIENDSHIP'],
      },
    ],
  })
  @Type(() => ProfileForFeedDto)
  profiles: ProfileForFeedDto[];

  @ApiProperty({
    description: 'Total number of profiles matching filters',
    example: 42,
  })
  total: number;

  @ApiPropertyOptional({
    description: 'Cursor for next page (null if no more pages)',
    nullable: true,
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  nextCursor: string | null;

  @ApiProperty({
    description: 'Whether there are more profiles to load',
    example: true,
  })
  hasMore: boolean;
}
