import {
  CanActivate,
  ExecutionContext,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const MAX_FILE_SIZE_KEY = 'maxFileSize';

@Injectable()
export class FileSizeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const maxSize = this.reflector.get<number>(
      MAX_FILE_SIZE_KEY,
      context.getHandler(),
    );

    if (!maxSize) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const file = request.file;

    if (file && file.size > maxSize) {
      throw new PayloadTooLargeException(
        `File size exceeds ${Math.round(maxSize / (1024 * 1024))}MB limit`,
      );
    }

    return true;
  }
}
