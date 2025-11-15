import { ApiProperty } from '@nestjs/swagger';
import { Gender, LookingFor } from '@prisma/client';

export class PreferenceResponseDto {
  @ApiProperty({
    description: 'Preference ID',
    example: 'clx123pref456',
  })
  id: string;

  @ApiProperty({
    description: 'User ID',
    example: '82fa655b-f8b0-40f8-9c94-3c174036090f',
  })
  userId: string;

  @ApiProperty({
    description: 'Minimum age',
    example: 18,
  })
  minAge: number;

  @ApiProperty({
    description: 'Maximum age',
    example: 35,
  })
  maxAge: number;

  @ApiProperty({
    description: 'Preferred gender',
    enum: Gender,
    example: Gender.FEMALE,
  })
  preferredGender: Gender;

  @ApiProperty({
    description: 'Looking for',
    enum: LookingFor,
    isArray: true,
    example: [LookingFor.FRIENDSHIP, LookingFor.COFFEE_CHAT],
  })
  lookingFor: LookingFor[];
}
