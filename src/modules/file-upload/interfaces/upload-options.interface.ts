export enum UploadFolder {
  PROFILE = 'profile-images',
}

export interface UploadOptions {
  folder: UploadFolder | string;
  maxSize?: number;
  allowedFormats?: string[];
  transformation?: ImageTransformation;
  prefix?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface ImageTransformation {
  width?: number;
  height?: number;
  crop?: 'fill' | 'fit' | 'scale' | 'crop';
  quality?: string | number;
  format?: 'auto' | 'jpg' | 'png' | 'webp';
}
