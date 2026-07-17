import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
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
import { DocumentExtractionApplyPlanService } from './document-extraction-apply-plan.service';
import { DocumentActionPlanRepository } from './document-action-plan.repository';
import { DocumentActionRepository } from './document-action.repository';
import { DocumentEntityCandidateRepository } from './document-entity-candidate.repository';
import { DocumentEntityLinkRepository } from './document-entity-link.repository';

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
  controllers: [
    DocumentExtractionController,
    DocumentExtractionOrgController,
    DocumentExtractionMetadataController,
  ],
  providers: [
    DocumentExtractionService,
    DocumentExtractionMetadataService,
    DocumentExtractionApplyService,
    DocumentExtractionApplyPlanService,
    DocumentExtractionPlausibilityService,
    DocumentFileIdentificationService,
    DocumentTextExtractorService,
    DocumentContentExtractorService,
    DocumentExtractionProcessor,
    DocumentExtractionHealthService,
    DocumentExtractionRecoveryScheduler,
    DocumentExtractionObservabilityService,
    DocumentActionPlanRepository,
    DocumentActionRepository,
    DocumentEntityCandidateRepository,
    DocumentEntityLinkRepository,
    LocalDocumentStorageService,
    { provide: DOCUMENT_STORAGE, useClass: LocalDocumentStorageService },
  ],
  exports: [
    DocumentExtractionService,
    DocumentExtractionApplyService,
    DocumentExtractionApplyPlanService,
    DocumentExtractionHealthService,
    DocumentActionPlanRepository,
    DocumentActionRepository,
    DocumentEntityCandidateRepository,
    DocumentEntityLinkRepository,
  ],
})
export class DocumentExtractionModule {}
