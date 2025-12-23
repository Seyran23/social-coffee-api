import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, LookingFor } from '@prisma/client';
import { Type } from 'class-transformer';

import { InterestDto } from '@/modules/profile/dto/response/interest.dto';

export class ProfileForFeedDto {
  @ApiProperty({
    description: 'Unique identifier for the user profile',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
  })
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
  })
  lastName: string;

  @ApiProperty({
    description: 'User date of birth',
    example: '1995-06-15T00:00:00.000Z',
    type: String,
    format: 'date-time',
  })
  birthDate: Date;

  @ApiProperty({
    description: 'User gender',
    enum: Gender,
    example: Gender.MALE,
    enumName: 'Gender',
  })
  gender: Gender;

  @ApiPropertyOptional({
    description: 'User biography or about section',
    nullable: true,
    example: 'Passionate photographer and traveler.',
  })
  bio: string | null;

  @ApiPropertyOptional({
    description: 'URL to user profile image',
    nullable: true,
    example:
      'https://res.cloudinary.com/demo/image/upload/v1234567890/profiles/user123.jpg',
  })
  profileImageUrl: string | null;

  @ApiProperty({
    description: 'List of user interests (can be empty array)',
    type: [InterestDto],
    example: [
      { id: '550e8400-e29b-41d4-a716-446655440000', name: 'Photography' },
      { id: '660e8400-e29b-41d4-a716-446655440001', name: 'Travel' },
    ],
    isArray: true,
  })
  @Type(() => InterestDto)
  interests: InterestDto[];

  @ApiPropertyOptional({
    description: 'What user is looking for',
    type: [String],
    enum: LookingFor,
    enumName: 'LookingFor',
    isArray: true,
    nullable: true,
    example: [LookingFor.CASUAL_DATING, LookingFor.FRIENDSHIP],
  })
  lookingFor: LookingFor[] | null;
}
