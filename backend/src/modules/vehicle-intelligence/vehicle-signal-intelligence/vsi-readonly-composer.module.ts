import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/database/prisma.module';
import { VsiReadonlySignalComposerService } from './vsi-readonly-composer.service';

@Module({
  imports: [PrismaModule],
  providers: [VsiReadonlySignalComposerService],
  exports: [VsiReadonlySignalComposerService],
})
export class VsiReadonlySignalComposerModule {}
