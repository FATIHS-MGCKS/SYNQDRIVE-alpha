import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigType } from '@nestjs/config';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import documentExtractionConfig from '@config/document-extraction.config';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { InvoicesModule } from '@modules/invoices/invoices.module';
import { FinesModule } from '@modules/fines/fines.module';
import { AiModule } from '@modules/ai/ai.module';
import { DocumentExtractionController } from './document-extraction.controller';
import { DocumentExtractionOrgController } from './document-extraction-org.controller';
import { DocumentExtractionMetadataController } from './document-extraction-metadata.controller';
import { DocumentExtractionService } from './document-extraction.service';
import { DocumentExtractionMetadataService } from './document-extraction-metadata.service';
import { DocumentExtractionApplyService } from './document-extraction-apply.service';
import { DocumentExtractionPlausibilityService } from './document-extraction-plausibility.service';
import { DocumentContentExtractorService } from './document-content-extractor.service';
import { DocumentFileIdentificationService } from './document-file-identification.service';
import { DocumentTextExtractorService } from './document-text-extractor.service';
import { DocumentExtractionProcessor } from './document-extraction.processor';
import { DocumentExtractionHealthService } from './document-extraction-health.service';
import { DocumentExtractionRecoveryScheduler } from '@workers/schedulers/document-extraction-recovery.scheduler';
import { LocalDocumentStorageService } from './storage/local-document-storage.service';
import { DOCUMENT_STORAGE } from './storage/document-storage.interface';
import { DocumentExtractionObservabilityService } from './document-extraction-observability.service';
import { DocumentApplySafetyPolicy } from './document-apply-safety.policy';
import { buildDocumentApplyFeatureFlags } from './document-apply-safety.config.util';
import {
  shouldRegisterDocumentExtractionApi,
  shouldRegisterDocumentExtractionConsumers,
} from '@shared/runtime/process-role.util';

const documentExtractionControllers = shouldRegisterDocumentExtractionApi()
  ? [
      DocumentExtractionController,
      DocumentExtractionOrgController,
      DocumentExtractionMetadataController,
    ]
  : [];

const documentExtractionConsumers = shouldRegisterDocumentExtractionConsumers()
  ? [DocumentExtractionProcessor, DocumentExtractionRecoveryScheduler]
  : [];

/**
 * AI Document Upload feature module.
 *
 * Owns ALL `vehicles/:vehicleId/document-extractions` routes (these were
 * previously inline in VehicleIntelligenceController and have been relocated
 * here — single source of truth, no duplicate flow). Domain application reuses
 * the existing services exported by VehicleIntelligenceModule / InvoicesModule.
 */
@Module({
  imports: [
    forwardRef(() => VehicleIntelligenceModule),
    forwardRef(() => InvoicesModule),
    FinesModule,
    AiModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.DOCUMENT_EXTRACTION }),
  ],
  controllers: documentExtractionControllers,
  providers: [
    DocumentExtractionService,
    DocumentExtractionMetadataService,
    DocumentExtractionApplyService,
    DocumentExtractionPlausibilityService,
    DocumentFileIdentificationService,
    DocumentTextExtractorService,
    DocumentContentExtractorService,
    DocumentExtractionHealthService,
    DocumentExtractionObservabilityService,
    {
      provide: DocumentApplySafetyPolicy,
      useFactory: (config: ConfigType<typeof documentExtractionConfig>) =>
        new DocumentApplySafetyPolicy(buildDocumentApplyFeatureFlags(config)),
      inject: [documentExtractionConfig.KEY],
    },
    LocalDocumentStorageService,
    { provide: DOCUMENT_STORAGE, useClass: LocalDocumentStorageService },
    ...documentExtractionConsumers,
  ],
  exports: [DocumentExtractionService, DocumentExtractionApplyService, DocumentExtractionHealthService],
})
export class DocumentExtractionModule {}
