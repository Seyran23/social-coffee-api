import { BadRequestException } from '@nestjs/common';

import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  FILE_SIGNATURES,
  FILENAME_SETTINGS,
} from '@/modules/file-upload/constants/file-upload';

export class FileValidator {
  static validateImage(file: Express.Multer.File, maxSize?: number): void {
    this.validateFile(file, ALLOWED_MIME_TYPES.IMAGE, maxSize, 'image');

    if (!this.isValidImageSignature(file.buffer)) {
      throw new BadRequestException('Invalid or corrupted image file');
    }

    const ext = this.getFileExtension(file.originalname);
    if (!(ALLOWED_EXTENSIONS.IMAGE as readonly string[]).includes(ext)) {
      throw new BadRequestException(
        `Invalid image extension. Allowed: ${ALLOWED_EXTENSIONS.IMAGE.join(', ')}`,
      );
    }
  }

  static validateFile(
    file: Express.Multer.File,
    allowedMimeTypes: readonly string[],
    maxSize?: number,
    fileType = 'file',
  ): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (maxSize && file.size > maxSize) {
      throw new BadRequestException(
        `File size exceeds ${Math.round(maxSize / (1024 * 1024))}MB limit`,
      );
    }

    if (!allowedMimeTypes.includes(file.mimetype)) {
      const allowedTypes = allowedMimeTypes
        .map(type => type.split('/')[1])
        .join(', ');
      throw new BadRequestException(
        `Invalid ${fileType} type. Allowed: ${allowedTypes}`,
      );
    }

    const sanitized = this.sanitizeFilename(file.originalname);
    if (sanitized.length === 0) {
      throw new BadRequestException('Invalid filename');
    }
  }

  private static isValidImageSignature(buffer: Buffer): boolean {
    if (buffer.length < 4) {
      return false;
    }

    const imageSignatures = [
      FILE_SIGNATURES.JPEG,
      FILE_SIGNATURES.PNG,
      FILE_SIGNATURES.WEBP,
    ];

    return imageSignatures.some(signature =>
      signature.every((byte, idx) => buffer[idx] === byte),
    );
  }

  static sanitizeFilename(filename: string): string {
    return filename
      .replace(
        FILENAME_SETTINGS.ALLOWED_CHARS_PATTERN,
        FILENAME_SETTINGS.REPLACEMENT_CHAR,
      )
      .replace(/\.{2,}/g, '.')
      .replace(/_{2,}/g, '_')
      .substring(0, FILENAME_SETTINGS.MAX_LENGTH);
  }

  static getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() ?? '';
  }
}
