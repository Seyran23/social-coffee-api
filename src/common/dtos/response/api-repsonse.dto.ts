import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ValidationErrorDto } from '@/common/dtos/response/validation-error-response.dto';

export class ApiResponseDto<TData> {
  @ApiProperty({
    description: 'Indicates if the request was successful',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'HTTP status code',
    example: 200,
  })
  statusCode: number;

  @ApiPropertyOptional({
    description: 'Response message',
    example: 'Operation completed successfully',
  })
  message?: string;

  @ApiPropertyOptional({
    description: 'Validation errors (if any)',
    type: [ValidationErrorDto],
  })
  errors?: ValidationErrorDto[];

  @ApiProperty({
    description: 'Response data',
  })
  data?: TData | TData[] | null;

  @ApiPropertyOptional({
    description: 'Timestamp of the response',
    example: '2024-01-15T10:30:00.000Z',
  })
  timestamp?: string;
}
