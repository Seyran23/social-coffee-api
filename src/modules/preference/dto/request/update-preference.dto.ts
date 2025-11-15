import { ApiProperty } from '@nestjs/swagger';
import { Gender, LookingFor } from '@prisma/client';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  Max,
  Min,
} from 'class-validator';

export class UpdatePreferenceDto {
  @ApiProperty({
    description: 'Minimum age preference',
    example: 18,
    minimum: 18,
    maximum: 120,
  })
  @IsInt()
  @Min(18)
  @Max(100)
  minAge: number;

  @ApiProperty({
    description: 'Maximum age preference',
    example: 35,
    minimum: 18,
    maximum: 120,
  })
  @IsInt()
  @Min(18)
  @Max(100)
  maxAge: number;

  @ApiProperty({
    description: 'Preferred gender',
    enum: Gender,
    example: Gender.FEMALE,
  })
  @IsEnum(Gender)
  preferredGender: Gender;

  @ApiProperty({
    description: 'What user is looking for',
    enum: LookingFor,
    isArray: true,
    example: [LookingFor.FRIENDSHIP, LookingFor.COFFEE_CHAT],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(LookingFor, { each: true })
  lookingFor: LookingFor[];
}
