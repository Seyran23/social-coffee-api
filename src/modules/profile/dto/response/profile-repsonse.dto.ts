import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, LookingFor } from '@prisma/client';
import { Type } from 'class-transformer';

import { InterestDto } from '@/modules/profile/dto/response/interest.dto';
import { PreferenceDto } from '@/modules/profile/dto/response/preference.dto';

export class ProfileResponseDto {
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
    description: 'User email address',
    example: 'john.doe@example.com',
  })
  email: string;

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
    description: 'URL to user profile image',
    example:
      'https://res.cloudinary.com/demo/image/upload/v1234567890/profiles/user123.jpg',
    nullable: true,
  })
  profileImageUrl: string | null;

  @ApiPropertyOptional({
    description: 'User biography or about section',
    example:
      'Passionate photographer and traveler. Love exploring new places and meeting new people!',
    nullable: true,
  })
  bio: string | null;

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
    description: 'User preferences (null if not set)',
    type: PreferenceDto,
    nullable: true,
    example: {
      minAge: 25,
      maxAge: 35,
      preferredGender: Gender.FEMALE,
      lookingFor: [LookingFor.EVENTS_COMPANION, LookingFor.FRIENDSHIP],
    },
  })
  @Type(() => PreferenceDto)
  preference: PreferenceDto | null;

  @ApiProperty({
    description: 'Timestamp when the profile was created',
    example: '2024-01-15T10:30:00.000Z',
    type: String,
    format: 'date-time',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Timestamp when the profile was last updated',
    example: '2024-12-04T14:22:00.000Z',
    type: String,
    format: 'date-time',
  })
  updatedAt: Date;
}
