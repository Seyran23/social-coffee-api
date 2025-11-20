import { Injectable, Logger } from '@nestjs/common';

import {
  ALLOWED_EXTENSIONS,
  FILE_SIZE_LIMITS,
  IMAGE_TRANSFORMATIONS,
} from '@/modules/file-upload/constants/file-upload';
import { UploadResult } from '@/modules/file-upload/interfaces/upload-result.interface';

import { UploadOptions } from '../interfaces/upload-options.interface';
import { FileValidator } from '../validators/file.validator';

import { StorageProviderService } from './storage-provider.service';

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);

  constructor(private readonly storageProvider: StorageProviderService) {}

  uploadImage(
    file: Express.Multer.File,
    options: Partial<UploadOptions> = {},
  ): Promise<UploadResult> {
    FileValidator.validateImage(
      file,
      options.maxSize ?? FILE_SIZE_LIMITS.IMAGE,
    );

    const uploadOptions: UploadOptions = {
      folder: options.folder ?? 'general',
      allowedFormats: options.allowedFormats ?? [...ALLOWED_EXTENSIONS.IMAGE],
      transformation: options.transformation ?? IMAGE_TRANSFORMATIONS.PROFILE,
      prefix: options.prefix,
      userId: options.userId,
      metadata: options.metadata,
    };

    this.logger.log(
      `Uploading image: ${file.originalname} to ${uploadOptions.folder}`,
    );
    return this.storageProvider.upload(file, uploadOptions);
  }

  uploadFile(
    file: Express.Multer.File,
    options: UploadOptions,
  ): Promise<UploadResult> {
    FileValidator.validateFile(
      file,
      options.allowedFormats ?? [],
      options.maxSize ?? FILE_SIZE_LIMITS.DEFAULT,
    );

    return this.storageProvider.upload(file, options);
  }

  replaceFile(
    file: Express.Multer.File,
    oldPublicId: string | undefined,
    options: Partial<UploadOptions> = {},
  ): Promise<UploadResult> {
    FileValidator.validateImage(
      file,
      options.maxSize ?? FILE_SIZE_LIMITS.IMAGE,
    );

    const uploadOptions: UploadOptions = {
      folder: options.folder ?? 'general',
      allowedFormats: options.allowedFormats ?? [...ALLOWED_EXTENSIONS.IMAGE],
      transformation: options.transformation,
      prefix: options.prefix,
      userId: options.userId,
      metadata: options.metadata,
    };

    this.logger.log(
      `Replacing file: ${oldPublicId ?? 'none'} with ${file.originalname}`,
    );
    return this.storageProvider.replace(file, uploadOptions, oldPublicId);
  }

  deleteFile(publicId: string): Promise<void> {
    this.logger.log(`Deleting file: ${publicId}`);
    return this.storageProvider.delete(publicId);
  }

  getFileUrl(publicId: string): string {
    return this.storageProvider.getUrl(publicId);
  }
}
