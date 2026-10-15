import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/database/prisma.module';
import { VsiReadonlySignalComposerService } from './vsi-readonly-composer.service';
import { VsiProviderSourceObservationRepository } from './vsi-provider-source-observation.repository';
import { VsiProviderSourceObservationWriterService } from './vsi-provider-source-observation.writer.service';
import { VsiStrictSourceAdvanceService } from './vsi-strict-source-advance.service';

@Module({
  imports: [PrismaModule],
  providers: [
    VsiReadonlySignalComposerService,
    VsiProviderSourceObservationRepository,
    VsiProviderSourceObservationWriterService,
    VsiStrictSourceAdvanceService,
  ],
  exports: [
    VsiReadonlySignalComposerService,
    VsiProviderSourceObservationWriterService,
  ],
})
export class VsiReadonlySignalComposerModule {}
