import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ResponseBuilder } from '@/common/utils/response-builder';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse();
    const statusCode = response.statusCode;

    return next.handle().pipe(
      map(data => {
        if (
          data &&
          typeof data === 'object' &&
          'success' in data &&
          'statusCode' in data
        ) {
          return data;
        }

        let message: string | undefined;
        let actualData = data;

        if (data && typeof data === 'object' && 'message' in data) {
          message = data.message;
          actualData = data.data !== undefined ? data.data : data;
        }

        return ResponseBuilder.success(actualData, message, statusCode);
      }),
    );
  }
}
