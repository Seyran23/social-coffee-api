import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { ERROR_MESSAGES } from '@/modules/auth/constants/validation/error-messages';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REGEX,
} from '@/modules/auth/constants/validation/general';

export class ResetPasswordDto {
  @ApiProperty({
    description:
      'New password (must contain uppercase, lowercase, number, and special character)',
    example: 'NewPassword123!',
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
  @Transform(({ value }) => value?.trim())
  newPassword: string;
}
