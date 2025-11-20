import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadApiResponse, v2 as cloudinary } from 'cloudinary';

import { CLOUDINARY_SETTINGS } from '@/modules/file-upload/constants/file-upload';
import { UploadResult } from '@/modules/file-upload/interfaces/upload-result.interface';
import { getFullFolderPath } from '@/modules/file-upload/utils/get-full-folder-path.util';

import { IStorageProvider } from '../interfaces/storage-provider.interface';
import { UploadOptions } from '../interfaces/upload-options.interface';

@Injectable()
export class StorageProviderService implements IStorageProvider {
  private readonly logger = new Logger(StorageProviderService.name);
  private configured = false;

  constructor(private configService: ConfigService) {
    this.initialize();
  }

  private initialize(): void {
    try {
      const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
      const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
      const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

      if (!cloudName || !apiKey || !apiSecret) {
        this.logger.error(
          'Cloudinary credentials missing in environment variables',
        );
        throw new Error('Storage provider is not configured');
      }

      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: CLOUDINARY_SETTINGS.SECURE,
      });

      this.configured = true;
      this.logger.log('Storage provider (Cloudinary) initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize storage provider', error);
      throw error;
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async upload(
    file: Express.Multer.File,
    options: UploadOptions,
  ): Promise<UploadResult> {
    if (!this.configured) {
      throw new Error('Storage provider is not configured');
    }

    try {
      const publicId = this.generatePublicId(options);
      const uploadOptions = this.buildUploadOptions(options, publicId);

      this.logger.log(`Uploading to: ${uploadOptions.folder}/${publicId}`);

      const result = await this.uploadToCloudinary(file.buffer, uploadOptions);

      return this.mapUploadResult(result);
    } catch (error) {
      this.logger.error(`Upload failed: ${error.message}`, error.stack);
      throw new Error('Failed to upload file to storage');
    }
  }

  async delete(publicId: string): Promise<void> {
    if (!publicId) {
      this.logger.warn('Attempted to delete file with empty publicId');
      return;
    }

    try {
      await cloudinary.uploader.destroy(publicId, {
        invalidate: CLOUDINARY_SETTINGS.INVALIDATE_CDN,
      });
      this.logger.log(`File deleted successfully: ${publicId}`);
    } catch (error) {
      this.logger.error(`Failed to delete file ${publicId}: ${error.message}`);
    }
  }

  async replace(
    file: Express.Multer.File,
    options: UploadOptions,
    oldPublicId?: string,
  ): Promise<UploadResult> {
    const result = await this.upload(file, options);

    if (oldPublicId) {
      await this.delete(oldPublicId);
    }

    return result;
  }

  getUrl(publicId: string): string {
    if (!publicId) {
      throw new Error('Public ID is required to generate URL');
    }
    return cloudinary.url(publicId, { secure: true });
  }

  private uploadToCloudinary(
    buffer: Buffer,
    options: any,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result as UploadApiResponse);
          }
        },
      );
      uploadStream.end(buffer);
    });
  }

  private buildUploadOptions(options: UploadOptions, publicId: string): any {
    const fullPath = getFullFolderPath(options.folder);

    const uploadOptions: any = {
      folder: fullPath,
      public_id: publicId,
      resource_type: CLOUDINARY_SETTINGS.RESOURCE_TYPE,
      allowed_formats: options.allowedFormats,
      invalidate: CLOUDINARY_SETTINGS.INVALIDATE_CDN,
      overwrite: CLOUDINARY_SETTINGS.OVERWRITE,
    };

    if (options.transformation) {
      uploadOptions.transformation = [
        {
          width: options.transformation.width,
          height: options.transformation.height,
          crop: options.transformation.crop ?? 'fill',
          quality: options.transformation.quality ?? 'auto',
          fetch_format: options.transformation.format ?? 'auto',
        },
      ];
    }

    return uploadOptions;
  }

  private generatePublicId(options: UploadOptions): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const prefix = options.prefix ?? 'file';
    const userId = options.userId ?? 'guest';
    return `${prefix}_${userId}_${timestamp}_${random}`;
  }

  private mapUploadResult(result: UploadApiResponse): UploadResult {
    return {
      url: result.url,
      secureUrl: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      folder: result.folder ?? '',
      metadata: {
        createdAt: result.created_at,
        resourceType: result.resource_type,
      },
    };
  }
}
