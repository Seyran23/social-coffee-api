import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, Role } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { ERROR_MESSAGES } from '@/modules/auth/constants/validation/error-messages';
import {
  BIO_MAX_LENGTH,
  BIO_MIN_LENGTH,
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  NAME_REGEX,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REGEX,
} from '@/modules/auth/constants/validation/general';
import { IsValidAge } from '@/modules/auth/decorators/is-valid-age.decorator';

const ASSIGNABLE_ROLES = [Role.USER, Role.CAFE_MANAGER] as const;

export class CreateUserDto {
  @ApiProperty({
    description: 'User first name',
    example: 'John',
    minLength: NAME_MIN_LENGTH,
    maxLength: NAME_MAX_LENGTH,
    pattern: NAME_REGEX.source,
  })
  @IsString({ message: ERROR_MESSAGES.FIRST_NAME_REQUIRED })
  @MinLength(NAME_MIN_LENGTH, { message: ERROR_MESSAGES.FIRST_NAME_TOO_SHORT })
  @MaxLength(NAME_MAX_LENGTH, { message: ERROR_MESSAGES.FIRST_NAME_TOO_LONG })
  @Matches(NAME_REGEX, { message: ERROR_MESSAGES.FIRST_NAME_INVALID })
  @Transform(({ value }) => value?.trim())
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    minLength: NAME_MIN_LENGTH,
    maxLength: NAME_MAX_LENGTH,
    pattern: NAME_REGEX.source,
  })
  @IsString({ message: ERROR_MESSAGES.LAST_NAME_REQUIRED })
  @MinLength(NAME_MIN_LENGTH, { message: ERROR_MESSAGES.LAST_NAME_TOO_SHORT })
  @MaxLength(NAME_MAX_LENGTH, { message: ERROR_MESSAGES.LAST_NAME_TOO_LONG })
  @Matches(NAME_REGEX, { message: ERROR_MESSAGES.LAST_NAME_INVALID })
  @Transform(({ value }) => value?.trim())
  lastName: string;

  @ApiProperty({
    description: 'User email address',
    example: 'manager@example.com',
    format: 'email',
    maxLength: EMAIL_MAX_LENGTH,
  })
  @IsEmail({}, { message: ERROR_MESSAGES.EMAIL_INVALID })
  @MaxLength(EMAIL_MAX_LENGTH, { message: ERROR_MESSAGES.EMAIL_TOO_LONG })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @ApiProperty({
    description:
      'Temporary password for the new account (must contain uppercase, lowercase, number, and special character). The user should change it after first sign-in.',
    example: 'Password123!',
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    pattern: PASSWORD_REGEX.source,
  })
  @IsString({ message: ERROR_MESSAGES.PASSWORD_TOO_SHORT })
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: ERROR_MESSAGES.PASSWORD_TOO_SHORT,
  })
  @MaxLength(PASSWORD_MAX_LENGTH, { message: ERROR_MESSAGES.PASSWORD_TOO_LONG })
  @Matches(PASSWORD_REGEX, { message: ERROR_MESSAGES.PASSWORD_WEAK })
  password: string;

  @ApiProperty({
    description: 'User birth date (must be at least 18 years old)',
    example: '1995-06-15',
    format: 'date',
    type: String,
  })
  @Type(() => Date)
  @IsValidAge({ message: ERROR_MESSAGES.INVALID_AGE })
  birthDate: string;

  @ApiProperty({
    description: 'User gender',
    enum: Gender,
    example: Gender.MALE,
    enumName: 'Gender',
  })
  @IsEnum(Gender, { message: ERROR_MESSAGES.GENDER_INVALID })
  gender: Gender;

  @ApiPropertyOptional({
    description: 'User bio/description',
    example: 'Manages this venue on behalf of Social Coffee.',
    minLength: BIO_MIN_LENGTH,
    maxLength: BIO_MAX_LENGTH,
    default: '',
  })
  @IsOptional()
  @IsString({ message: ERROR_MESSAGES.BIO_REQUIRED })
  @MaxLength(BIO_MAX_LENGTH, { message: ERROR_MESSAGES.BIO_TOO_LONG })
  @Transform(({ value }) => value?.trim())
  bio?: string;

  @ApiPropertyOptional({
    description:
      'Role to create the account with. Defaults to CAFE_MANAGER — this endpoint cannot create ADMIN accounts.',
    enum: ASSIGNABLE_ROLES,
    example: Role.CAFE_MANAGER,
    default: Role.CAFE_MANAGER,
  })
  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES, {
    message: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}`,
  })
  role?: (typeof ASSIGNABLE_ROLES)[number];
}
