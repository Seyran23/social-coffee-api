import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class FileUploadInterceptor implements NestInterceptor {
  private readonly logger = new Logger(FileUploadInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const file = request.file;

    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    this.logger.log(
      `File upload started: ${file.originalname} (${Math.round(file.size / 1024)}KB)`,
    );

    return next.handle().pipe(
      tap(() => {
        this.logger.log(`File upload completed: ${file.originalname}`);
      }),
    );
  }
}
