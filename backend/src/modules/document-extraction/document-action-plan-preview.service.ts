import { BadRequestException, Injectable } from '@nestjs/common';
import type { DocumentExtractionType } from '@prisma/client';
import { DocumentActionOrchestratorService } from './document-action-orchestrator.service';
import {
  buildActionPlanPreviewSummary,
  buildActionPreviewCards,
} from './document-action-plan-preview.builder';
import type { PublicDocumentActionPlanPreviewDto } from './document-action-plan-preview.types';
import { DOCUMENT_ACTION_PLAN_VERSION } from './document-action-plan.types';
import {
  readActionPlanPreferences,
  type DocumentActionPlanPreferences,
} from './document-action-plan-preferences.util';
import {
  hasSavedFieldReview,
  readPlausibilityChecks,
  readPlausibilityOverallStatus,
} from './document-field-review.util';
import { requireApplyDocumentType } from './document-extraction-lifecycle.util';
import { resolveConfirmedValuesForActionPlan } from './document-field-provenance.util';
import { readConfirmedDataObject } from './document-entity-link.util';
import { readDocumentActionPlanState } from './document-action-plan.store';
import { DOCUMENT_ACTION_PREVIEW_STATUSES } from './document-action-plan-preview.types';

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
export class DocumentActionPlanPreviewService {
  constructor(private readonly actionOrchestrator: DocumentActionOrchestratorService) {}

  async buildForRecord(
    record: ExtractionRecord,
    options?: { vehicleLabel?: string | null; preferencesOverride?: DocumentActionPlanPreferences },
  ): Promise<PublicDocumentActionPlanPreviewDto> {
    if (record.status !== 'READY_FOR_REVIEW') {
      throw new BadRequestException(
        `Action plan preview requires READY_FOR_REVIEW (current: ${record.status})`,
      );
    }

    const confirmedBase = readConfirmedDataObject(record.confirmedData);
    if (!hasSavedFieldReview(confirmedBase)) {
      throw new BadRequestException(
        'Action plan preview requires saved field review — save reviewed fields first',
      );
    }

    const applyDocumentType = requireApplyDocumentType(record);
    const preferences =
      options?.preferencesOverride ?? readActionPlanPreferences(confirmedBase);
    const actionPlanConfirmedData = resolveConfirmedValuesForActionPlan(confirmedBase);
    const plausibilityChecks = readPlausibilityChecks(record.plausibility);
    const plausibilityBlocker = readPlausibilityOverallStatus(record.plausibility) === 'BLOCKER';
    const planState = readDocumentActionPlanState(record.plausibility);
    const planStatus =
      planState.actionPlan?.status === 'INVALIDATED'
        ? 'INVALIDATED'
        : planState.actionPlan && planState.actionPlan.fingerprint
          ? 'STALE'
          : 'PREVIEW';

    if (!this.actionOrchestrator.supportsExecutorPath(applyDocumentType)) {
      return {
        planId: null,
        fingerprint: '',
        planVersion: DOCUMENT_ACTION_PLAN_VERSION,
        planOutcome: 'LEGACY',
        planStatus: 'PREVIEW',
        summary:
          'Dieses Dokument wird über den klassischen Übernahmepfad verarbeitet — kein Aktionsplan erforderlich.',
        blocked: plausibilityBlocker,
        canConfirm: !plausibilityBlocker,
        confirmBlockedReason: plausibilityBlocker
          ? 'Plausibilitätsprüfung blockiert die Übernahme.'
          : null,
        disabledOptionalActions: preferences.disabledOptionalActions,
        actions: [],
      };
    }

    if (!record.vehicleId) {
      return {
        planId: null,
        fingerprint: '',
        planVersion: DOCUMENT_ACTION_PLAN_VERSION,
        planOutcome: 'BLOCKED',
        planStatus: 'PREVIEW',
        summary: 'Bitte ordnen Sie zuerst ein Fahrzeug zu, bevor Aktionen geplant werden können.',
        blocked: true,
        canConfirm: false,
        confirmBlockedReason: 'Fahrzeugzuordnung fehlt.',
        disabledOptionalActions: preferences.disabledOptionalActions,
        actions: [],
      };
    }

    const sourceFileUrl =
      record.sourceFileUrl ??
      (record.objectKey ? `storage://${record.objectKey}` : null);

    const plan = await this.actionOrchestrator.buildPreviewPlan({
      extractionId: record.id,
      organizationId: record.organizationId ?? null,
      vehicleId: record.vehicleId,
      documentType: applyDocumentType,
      sourceFileUrl,
      confirmedData: actionPlanConfirmedData,
      plausibilityChecks,
      plausibility: record.plausibility,
    });

    const actions = buildActionPreviewCards({
      plan,
      confirmedData: actionPlanConfirmedData,
      preferences,
      vehicleLabel: options?.vehicleLabel ?? null,
    });

    const planBlocked =
      plan.planOutcome === 'BLOCKED' || plan.planOutcome.endsWith('_BLOCKED');
    const requiredActionBlocked = actions.some(
      (action) =>
        action.requirement === 'REQUIRED' && action.status === DOCUMENT_ACTION_PREVIEW_STATUSES.BLOCKED,
    );
    const blocked = plausibilityBlocker || planBlocked || requiredActionBlocked;

    let confirmBlockedReason: string | null = null;
    if (plausibilityBlocker) {
      confirmBlockedReason = 'Plausibilitätsprüfung blockiert die Übernahme.';
    } else if (planBlocked) {
      confirmBlockedReason = 'Erforderliche Angaben fehlen oder der Aktionsplan ist blockiert.';
    } else if (requiredActionBlocked) {
      confirmBlockedReason = 'Mindestens eine erforderliche Aktion ist blockiert.';
    }

    return {
      planId: plan.planId,
      fingerprint: plan.fingerprint,
      planVersion: plan.planVersion,
      planOutcome: plan.planOutcome,
      planStatus,
      summary: buildActionPlanPreviewSummary(plan, blocked),
      blocked,
      canConfirm: !blocked,
      confirmBlockedReason,
      disabledOptionalActions: preferences.disabledOptionalActions,
      actions,
    };
  }
}
