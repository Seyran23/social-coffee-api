import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

export const ApiSuccessResponse = <TModel extends Type<any>>(
  model: TModel,
  options?: {
    description?: string;
    isArray?: boolean;
    status?: number;
  },
) => {
  const {
    description = 'Successful response',
    isArray = false,
    status = 200,
  } = options ?? {};

  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status,
      description,
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'number', example: status },
          message: { type: 'string', example: description },
          data: isArray
            ? {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
              }
            : {
                $ref: getSchemaPath(model),
              },
          timestamp: {
            type: 'string',
            format: 'date-time',
            example: '2024-01-15T10:30:00.000Z',
          },
        },
        required: ['success', 'statusCode', 'data', 'timestamp'],
      },
    }),
  );
};

export const ApiMessageResponse = (
  status = 200,
  example = 'Operation completed successfully',
) => {
  return ApiResponse({
    status,
    description: example,
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        statusCode: { type: 'number', example: status },
        message: { type: 'string', example },
        data: { type: 'null', example: null },
        timestamp: { type: 'string', format: 'date-time' },
      },
      required: ['success', 'statusCode', 'message', 'data', 'timestamp'],
    },
  });
};

export const ApiErrorResponse = (
  status: number,
  description: string,
  includeValidationErrors = false,
) => {
  const properties: any = {
    success: { type: 'boolean', example: false },
    statusCode: { type: 'number', example: status },
    message: { type: 'string', example: description },
    data: { type: 'null', example: null },
    timestamp: {
      type: 'string',
      format: 'date-time',
      example: '2024-01-15T10:30:00.000Z',
    },
  };

  if (includeValidationErrors) {
    properties.errors = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string', example: 'email' },
          messages: {
            type: 'array',
            items: { type: 'string' },
            example: ['Email is invalid'],
          },
        },
        required: ['field', 'messages'],
      },
    };
  }

  return ApiResponse({
    status,
    description,
    schema: {
      type: 'object',
      properties,
      required: ['success', 'statusCode', 'message', 'data', 'timestamp'],
    },
  });
};

export const ApiValidationErrorResponse = () => {
  return applyDecorators(
    ApiErrorResponse(400, 'Bad Request - Validation failed', true),
  );
};

export const ApiCommonErrorResponses = () => {
  return applyDecorators(
    ApiErrorResponse(401, 'Unauthorized - Authentication required'),
    ApiErrorResponse(403, 'Forbidden - Insufficient permissions'),
    ApiErrorResponse(404, 'Not Found - Resource does not exist'),
    ApiErrorResponse(500, 'Internal Server Error'),
  );
};

export const ApiAllErrorResponses = () => {
  return applyDecorators(
    ApiValidationErrorResponse(),
    ApiCommonErrorResponses(),
  );
};
