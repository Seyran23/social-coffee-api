import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';

import { FILE_SIZE_LIMITS } from '@/modules/file-upload/constants/file-upload';

export interface UploadFileOptions {
  fieldName?: string;
  maxSize?: number;
  description?: string;
}

export function UploadFile(options: UploadFileOptions = {}) {
  const fieldName = options.fieldName ?? 'file';
  const maxSize = options.maxSize ?? FILE_SIZE_LIMITS.DEFAULT;

  return applyDecorators(
    UseInterceptors(
      FileInterceptor(fieldName, {
        limits: {
          fileSize: maxSize,
          files: 1,
        },
      }),
    ),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      description: options.description ?? 'File upload',
      schema: {
        type: 'object',
        properties: {
          [fieldName]: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    }),
  );
}
