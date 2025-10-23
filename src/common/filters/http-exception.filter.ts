import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

import { ValidationErrorDto } from '@/common/dtos/response/validation-error-response.dto';
import { ResponseBuilder } from '@/common/utils/response-builder';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: ValidationErrorDto[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as any;

        if (Array.isArray(responseObj.message)) {
          message = 'Validation failed';
          errors = this.formatValidationErrors(responseObj.message);
        } else {
          message = responseObj.message ?? exception.message;

          if (responseObj.errors) {
            errors = responseObj.errors;
          }
        }
      } else {
        message = String(exceptionResponse);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const errorResponse = errors
      ? ResponseBuilder.validationError(errors, message, status)
      : ResponseBuilder.error(message, status);

    response.status(status).json(errorResponse);
  }

  private formatValidationErrors(messages: any[]): ValidationErrorDto[] {
    const errorMap = new Map<string, string[]>();

    messages.forEach(msg => {
      this.extractErrors(msg, '', errorMap);
    });

    return Array.from(errorMap.entries()).map(([field, messages]) => ({
      field,
      messages,
    }));
  }

  private extractErrors(
    error: any,
    parentProperty: string,
    errorMap: Map<string, string[]>,
  ): void {
    if (!error) {
      return;
    }

    if (typeof error === 'string') {
      const field = parentProperty || 'general';
      if (!errorMap.has(field)) {
        errorMap.set(field, []);
      }
      errorMap.get(field)!.push(error);
      return;
    }

    if (error.property) {
      const fullPath = parentProperty
        ? `${parentProperty}.${error.property}`
        : error.property;

      if (error.constraints) {
        const fieldErrors = Object.values(error.constraints) as string[];

        if (!errorMap.has(fullPath)) {
          errorMap.set(fullPath, []);
        }
        errorMap.get(fullPath)!.push(...fieldErrors);
      }

      if (
        error.children &&
        Array.isArray(error.children) &&
        error.children.length > 0
      ) {
        error.children.forEach((child: any) => {
          this.extractErrors(child, fullPath, errorMap);
        });
      }
    }
  }
}
