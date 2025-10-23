import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString } from 'class-validator';

import { ERROR_MESSAGES } from '@/modules/auth/constants/validation/error-messages';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REGEX,
} from '@/modules/auth/constants/validation/general';

export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: ERROR_MESSAGES.EMAIL_INVALID })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'Password123!',
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    pattern: PASSWORD_REGEX.source,
  })
  @IsString({ message: ERROR_MESSAGES.PASSWORD_TOO_SHORT })
  password: string;
}
