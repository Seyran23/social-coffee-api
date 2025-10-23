import { ApiResponseDto } from '@/common/dtos/response/api-repsonse.dto';
import { ValidationErrorDto } from '@/common/dtos/response/validation-error-response.dto';
import { PaginationInfo } from '@/common/interfaces/response/pagination-info.interface';

export class ResponseBuilder {
  static success<TData>(
    data: TData | TData[] | null,
    message?: string,
    statusCode = 200,
  ): ApiResponseDto<TData> {
    return {
      success: true,
      statusCode,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  static error(
    message: string,
    statusCode = 400,
    errors?: ValidationErrorDto[],
  ): ApiResponseDto<null> {
    return {
      success: false,
      statusCode,
      message,
      errors,
      data: null,
      timestamp: new Date().toISOString(),
    };
  }

  static validationError(
    errors: ValidationErrorDto[],
    message = 'Validation failed',
    statusCode = 400,
  ): ApiResponseDto<null> {
    return {
      success: false,
      statusCode,
      message,
      errors,
      data: null,
      timestamp: new Date().toISOString(),
    };
  }

  static paginated<TData>(
    data: TData[],
    total: number,
    page: number,
    limit: number,
    message?: string,
  ): ApiResponseDto<TData> & { pagination: PaginationInfo } {
    return {
      success: true,
      statusCode: 200,
      message,
      data,
      timestamp: new Date().toISOString(),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    };
  }
}
