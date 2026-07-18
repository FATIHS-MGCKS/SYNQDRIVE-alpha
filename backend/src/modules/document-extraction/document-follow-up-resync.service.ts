import { Injectable } from '@nestjs/common';
import type { DocumentExtractionType } from '@prisma/client';
import { DocumentActionOrchestratorService } from './document-action-orchestrator.service';
import { DocumentFollowUpSuggestionService } from './document-follow-up-suggestion.service';
import { hasSavedFieldReview, readPlausibilityChecks } from './document-field-review.util';
import { requireApplyDocumentType } from './document-extraction-lifecycle.util';
import { resolveConfirmedValuesForActionPlan } from './document-field-provenance.util';
import { readConfirmedDataObject } from './document-entity-link.util';

type ExtractionRecord = {
  id: string;
  organizationId: string | null;
  vehicleId: string | null;
  status: string;
  documentType?: DocumentExtractionType | null;
  effectiveDocumentType?: DocumentExtractionType | null;
  confirmedData: unknown;
  plausibility: unknown;
  sourceFileUrl?: string | null;
  objectKey?: string | null;
};

@Injectable()
export class DocumentFollowUpResyncService {
  constructor(
    private readonly actionOrchestrator: DocumentActionOrchestratorService,
    private readonly followUpSuggestionService: DocumentFollowUpSuggestionService,
  ) {}

  async resyncAfterPlanChange(record: ExtractionRecord): Promise<void> {
    if (record.status !== 'READY_FOR_REVIEW') return;

    const confirmedBase = readConfirmedDataObject(record.confirmedData);
    if (!hasSavedFieldReview(confirmedBase)) return;
    if (!record.vehicleId) return;

    const applyDocumentType = requireApplyDocumentType(record);
    if (!this.actionOrchestrator.supportsExecutorPath(applyDocumentType)) return;

    const sourceFileUrl =
      record.sourceFileUrl ??
      (record.objectKey ? `storage://${record.objectKey}` : null);

    const plan = await this.actionOrchestrator.buildPreviewPlan({
      extractionId: record.id,
      organizationId: record.organizationId ?? null,
      vehicleId: record.vehicleId,
      documentType: applyDocumentType,
      sourceFileUrl,
      confirmedData: resolveConfirmedValuesForActionPlan(confirmedBase),
      plausibilityChecks: readPlausibilityChecks(record.plausibility),
      plausibility: record.plausibility,
    });

    await this.followUpSuggestionService.syncForActionPlan({
      record,
      plan,
      confirmedData: resolveConfirmedValuesForActionPlan(confirmedBase),
    });
  }
}
