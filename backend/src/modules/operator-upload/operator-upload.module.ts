import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { StationsModule } from '@modules/stations/stations.module';
import { DocumentsModule } from '@modules/documents/documents.module';
import { OperatorUploadController } from './operator-upload.controller';
import { OperatorUploadService } from './operator-upload.service';
import { OperatorUploadRetentionScheduler } from './operator-upload-retention.scheduler';

@Module({
  imports: [PrismaModule, StationsModule, DocumentsModule],
  controllers: [OperatorUploadController],
  providers: [OperatorUploadService, OperatorUploadRetentionScheduler],
  exports: [OperatorUploadService],
})
export class OperatorUploadModule {}
