import { ApiProperty } from '@nestjs/swagger';

export class ValidationErrorDto {
  @ApiProperty({
    description: 'Field name that failed validation',
    example: 'email',
  })
  field: string;

  @ApiProperty({
    description: 'Array of validation error messages',
    example: ['Email is invalid', 'Email is required'],
    type: [String],
  })
  messages: string[];
}
