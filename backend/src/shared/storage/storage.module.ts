import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * Global storage module — exposes {@link StorageService} app-wide so upload
 * controllers can route files through the configured driver (local | s3).
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
