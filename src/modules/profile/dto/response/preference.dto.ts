import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, LookingFor } from '@prisma/client';

export class PreferenceDto {
  @ApiProperty({
    description: 'Minimum age preference',
    example: 25,
    minimum: 18,
    maximum: 100,
  })
  minAge: number;

  @ApiProperty({
    description: 'Maximum age preference',
    example: 35,
    minimum: 18,
    maximum: 100,
  })
  maxAge: number;

  @ApiPropertyOptional({
    description: 'Preferred gender (null means any gender)',
    enum: Gender,
    enumName: 'Gender',
    nullable: true,
    example: Gender.FEMALE,
  })
  preferredGender: Gender | null;

  @ApiPropertyOptional({
    description: 'What user is looking for (can be empty array or null)',
    type: [String],
    enum: LookingFor,
    enumName: 'LookingFor',
    isArray: true,
    nullable: true,
    example: [LookingFor.CASUAL_DATING, LookingFor.FRIENDSHIP],
  })
  lookingFor: LookingFor[] | null;
}
