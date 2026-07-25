import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { OperatorUploadController } from './operator-upload.controller';
import { OperatorUploadService } from './operator-upload.service';

@Module({
  imports: [PrismaModule],
  controllers: [OperatorUploadController],
  providers: [OperatorUploadService],
  exports: [OperatorUploadService],
})
export class OperatorUploadModule {}
