import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { FileUploadService } from './services/file-upload.service';
import { StorageProviderService } from './services/storage-provider.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [StorageProviderService, FileUploadService],
  exports: [FileUploadService],
})
export class FileUploadModule {}
