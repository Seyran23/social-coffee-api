import { UploadResult } from '@/modules/file-upload/interfaces/upload-result.interface';

import { UploadOptions } from './upload-options.interface';

export interface IStorageProvider {
  upload(
    file: Express.Multer.File,
    options: UploadOptions,
  ): Promise<UploadResult>;

  delete(publicId: string): Promise<void>;

  replace(
    file: Express.Multer.File,
    options: UploadOptions,
    oldPublicId?: string,
  ): Promise<UploadResult>;

  getUrl(publicId: string): string;

  isConfigured(): boolean;
}
