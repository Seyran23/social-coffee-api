export const PROJECT_NAME = 'social-coffee';

export enum UploadFolder {
  PROFILE = 'profile-images',
}

export const FILE_SIZE_LIMITS = {
  DEFAULT: 5 * 1024 * 1024,
  IMAGE: 5 * 1024 * 1024, // 5MB
} as const;

export const ALLOWED_MIME_TYPES = {
  IMAGE: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
} as const;

export const ALLOWED_EXTENSIONS = {
  IMAGE: ['jpg', 'jpeg', 'png', 'webp'],
} as const;

export const FILE_SIGNATURES = {
  JPEG: [0xff, 0xd8, 0xff],
  PNG: [0x89, 0x50, 0x4e, 0x47],
  WEBP: [0x52, 0x49, 0x46, 0x46],
} as const;

export const IMAGE_TRANSFORMATIONS = {
  PROFILE: {
    width: 500,
    height: 500,
    crop: 'fill' as const,
    quality: 'auto' as const,
    format: 'auto' as const,
  },
  THUMBNAIL: {
    width: 150,
    height: 150,
    crop: 'fill' as const,
    quality: 'auto' as const,
    format: 'auto' as const,
  },
  PRODUCT: {
    width: 800,
    height: 800,
    crop: 'fill' as const,
    quality: 90,
    format: 'auto' as const,
  },
  BANNER: {
    width: 1200,
    height: 400,
    crop: 'fill' as const,
    quality: 'auto' as const,
    format: 'auto' as const,
  },
} as const;

export const FILENAME_SETTINGS = {
  MAX_LENGTH: 100,
  ALLOWED_CHARS_PATTERN: /[^a-zA-Z0-9._-]/g,
  REPLACEMENT_CHAR: '_',
} as const;

export const UPLOAD_RATE_LIMITS = {
  TTL: 15 * 60 * 1000, // 15 minutes
  LIMIT: 5, // 5 uploads per TTL
} as const;

export const CLOUDINARY_SETTINGS = {
  SECURE: true,
  INVALIDATE_CDN: true, // Invalidate CDN cache on update
  OVERWRITE: false, // Don't overwrite existing files
  RESOURCE_TYPE: 'auto' as const, // Auto-detect resource type
} as const;
