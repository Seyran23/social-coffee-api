export interface UploadResult {
  url: string;
  secureUrl: string;
  publicId: string;
  format: string;
  width?: number;
  height?: number;
  bytes: number;
  folder: string;
  metadata?: Record<string, any>;
}

export interface FileMetadata {
  url: string;
  publicId: string;
  folder: string;
  uploadedAt: Date;
}
