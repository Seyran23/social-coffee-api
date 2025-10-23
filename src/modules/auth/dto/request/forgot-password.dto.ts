import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

import { ERROR_MESSAGES } from '@/modules/auth/constants/validation/error-messages';

export class ForgotPasswordDto {
  @ApiProperty({
    description:
      'The email address associated with the account that needs a password reset.',
    example: 'user.name@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: ERROR_MESSAGES.EMAIL_INVALID })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;
}
