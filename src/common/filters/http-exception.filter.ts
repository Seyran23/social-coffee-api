import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { ValidationErrorDto } from '@/common/dtos/response/validation-error-response.dto';
import { ResponseBuilder } from '@/common/utils/response-builder';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: ValidationErrorDto[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>;

        if (Array.isArray(responseObj.message)) {
          message = 'Validation failed';
          errors = this.formatValidationErrors(
            responseObj.message as unknown[],
          );
        } else {
          message = (responseObj.message as string) ?? exception.message;

          if (responseObj.errors) {
            errors = responseObj.errors as ValidationErrorDto[];
          }
        }
      } else {
        message = String(exceptionResponse);
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled error on ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );
      message = 'Internal server error';
    } else {
      this.logger.error(
        `Unknown exception thrown on ${request.method} ${request.url}`,
        String(exception),
      );
    }

    const errorResponse = errors
      ? ResponseBuilder.validationError(errors, message, status)
      : ResponseBuilder.error(message, status);

    response.status(status).json(errorResponse);
  }

  private formatValidationErrors(messages: unknown[]): ValidationErrorDto[] {
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
    error: unknown,
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

    const errObj = error as {
      property?: string;
      constraints?: Record<string, string>;
      children?: unknown[];
    };

    if (errObj.property) {
      const fullPath = parentProperty
        ? `${parentProperty}.${errObj.property}`
        : errObj.property;

      if (errObj.constraints) {
        const fieldErrors = Object.values(errObj.constraints);

        if (!errorMap.has(fullPath)) {
          errorMap.set(fullPath, []);
        }
        errorMap.get(fullPath)!.push(...fieldErrors);
      }

      if (Array.isArray(errObj.children) && errObj.children.length > 0) {
        errObj.children.forEach(child => {
          this.extractErrors(child, fullPath, errorMap);
        });
      }
    }
  }
}
