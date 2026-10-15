import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/database/prisma.module';
import { VsiReadonlySignalComposerService } from './vsi-readonly-composer.service';
import { VsiProviderSourceObservationRepository } from './vsi-provider-source-observation.repository';
import { VsiProviderSourceObservationWriterService } from './vsi-provider-source-observation.writer.service';
import { VsiStrictSourceAdvanceService } from './vsi-strict-source-advance.service';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import { VsiProfileLifecycleOutboxRepository } from './vsi-profile-lifecycle-outbox.repository';
import { VsiProfileLifecycleEnqueueService } from './vsi-profile-lifecycle-enqueue.service';
import { VsiProfileLifecycleOutboxProcessor } from './vsi-profile-lifecycle.processor';
import { VsiProfileLifecycleOutboxWorker } from './vsi-profile-lifecycle.worker';

@Module({
  imports: [PrismaModule],
  providers: [
    VsiReadonlySignalComposerService,
    VsiProviderSourceObservationRepository,
    VsiProviderSourceObservationWriterService,
    VsiStrictSourceAdvanceService,
    VsiDeclaredCatalogResolver,
    VsiSignalProfileMaterializationService,
    VsiProfileLifecycleOutboxRepository,
    VsiProfileLifecycleEnqueueService,
    VsiProfileLifecycleOutboxProcessor,
    VsiProfileLifecycleOutboxWorker,
  ],
  exports: [
    VsiReadonlySignalComposerService,
    VsiProviderSourceObservationWriterService,
    VsiSignalProfileMaterializationService,
    VsiDeclaredCatalogResolver,
    VsiProfileLifecycleEnqueueService,
    VsiProfileLifecycleOutboxProcessor,
    VsiProfileLifecycleOutboxWorker,
  ],
})
export class VsiReadonlySignalComposerModule {}
