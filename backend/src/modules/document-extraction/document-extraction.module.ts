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
import { DocumentActionOrchestratorService } from './document-action-orchestrator.service';
import { DocumentActionExecutorRegistry } from './document-action-executor.registry';
import { ArchiveDocumentActionExecutor } from './executors/archive-document-action.executor';
import { LinkEntityDocumentActionExecutor } from './executors/link-entity-document-action.executor';
import { CreateFineDocumentActionExecutor } from './executors/create-fine-document-action.executor';
import {
  CreateCreditNoteDocumentActionExecutor,
  CreateInvoiceDocumentActionExecutor,
} from './executors/create-invoice-document-action.executor';
import {
  CreateComplianceServiceEventDocumentActionExecutor,
  CreateServiceEventDocumentActionExecutor,
} from './executors/create-service-document-action.executor';
import {
  RefreshVehicleServiceHistoryDocumentActionExecutor,
  UpdateVehicleComplianceDocumentActionExecutor,
} from './executors/update-vehicle-from-extraction-document-action.executor';
import {
  CreateDamageDraftDocumentActionExecutor,
  CreateDamageRecordDocumentActionExecutor,
  LinkExistingDamageDocumentActionExecutor,
} from './executors/create-damage-document-action.executor';
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
    DocumentActionOrchestratorService,
    DocumentActionExecutorRegistry,
    ArchiveDocumentActionExecutor,
    LinkEntityDocumentActionExecutor,
    CreateFineDocumentActionExecutor,
    CreateInvoiceDocumentActionExecutor,
    CreateCreditNoteDocumentActionExecutor,
    CreateServiceEventDocumentActionExecutor,
    CreateComplianceServiceEventDocumentActionExecutor,
    UpdateVehicleComplianceDocumentActionExecutor,
    RefreshVehicleServiceHistoryDocumentActionExecutor,
    CreateDamageDraftDocumentActionExecutor,
    CreateDamageRecordDocumentActionExecutor,
    LinkExistingDamageDocumentActionExecutor,
    DocumentExtractionPlausibilityService,
    DocumentFileIdentificationService,
    DocumentTextExtractorService,
    DocumentContentExtractorService,
    DocumentExtractionProcessor,
    DocumentExtractionHealthService,
    DocumentExtractionRecoveryScheduler,
    DocumentExtractionObservabilityService,
    LocalDocumentStorageService,
    { provide: DOCUMENT_STORAGE, useClass: LocalDocumentStorageService },
  ],
  exports: [DocumentExtractionService, DocumentExtractionApplyService, DocumentExtractionHealthService],
})
export class DocumentExtractionModule {}
