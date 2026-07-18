import { readDocumentActionPlanState } from './document-action-plan.store';
import {
  DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES,
  isSuccessfulApplyLifecycle,
  isTerminalApplyLifecycleStatus,
  listRetryableFailedActionIndices,
} from './document-action-plan.state-machine';
import { DOCUMENT_ACTION_EXECUTION_STATUSES } from './document-action.types';
import { resolveActionCatalogEntry } from './document-action-plan-preview.builder';
import type {
  PublicDocumentApplyActionResultDto,
  PublicDocumentApplyEntityLinkDto,
  PublicDocumentApplyResultDto,
} from './document-apply-result.types';
import { translateDocumentActionErrorCode } from './document-apply-result.messages';

type ApplyResultRecord = {
  id: string;
  vehicleId: string | null;
  organizationId?: string | null;
  status: string;
  plausibility?: unknown;
};

function resolveEntityLink(input: {
  semanticAction: string;
  resultEntityType?: string | null;
  resultEntityId?: string | null;
  output?: Record<string, unknown>;
  vehicleId: string | null;
}): PublicDocumentApplyEntityLinkDto | null {
  const entityId =
    input.resultEntityId ??
    (typeof input.output?.fineId === 'string' ? input.output.fineId : null) ??
    (typeof input.output?.invoiceId === 'string' ? input.output.invoiceId : null) ??
    (typeof input.output?.damageId === 'string' ? input.output.damageId : null) ??
    (typeof input.output?.serviceEventId === 'string' ? input.output.serviceEventId : null) ??
    null;

  if (!entityId) return null;

  const catalog = resolveActionCatalogEntry(input.semanticAction);
  const entityType =
    input.resultEntityType ??
    (input.semanticAction.includes('FINE')
      ? 'fine'
      : input.semanticAction.includes('INVOICE') || input.semanticAction.includes('CREDIT_NOTE')
        ? 'invoice'
        : input.semanticAction.includes('DAMAGE')
          ? 'damage'
          : input.semanticAction.includes('SERVICE')
            ? 'service_event'
            : catalog.targetEntityType) ??
    'entity';

  const labelByType: Record<string, string> = {
    fine: 'Bußgeld öffnen',
    invoice: 'Rechnung öffnen',
    damage: 'Schaden öffnen',
    service_event: 'Serviceeintrag öffnen',
    vehicle: 'Fahrzeug öffnen',
    document: 'Dokument ansehen',
  };

  return {
    entityType,
    entityId,
    label: labelByType[entityType] ?? 'Ziel öffnen',
    targetModule: catalog.targetModule,
    targetModuleLabel: catalog.targetModuleLabel,
  };
}

function mapExecutionStatus(status: string): PublicDocumentApplyActionResultDto['status'] {
  if (status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) return 'SUCCEEDED';
  if (status === DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED) return 'FAILED';
  if (status === DOCUMENT_ACTION_EXECUTION_STATUSES.SKIPPED) return 'SKIPPED';
  if (status === DOCUMENT_ACTION_EXECUTION_STATUSES.RUNNING) return 'RUNNING';
  return 'PENDING';
}

function buildSummary(input: {
  lifecycleStatus: string;
  extractionStatus: string;
  requiredActionsComplete: boolean;
  partiallyApplied: boolean;
  applyFailed: boolean;
  failedCount: number;
  succeededCount: number;
}): { summary: string; detailSummary: string | null } {
  if (input.lifecycleStatus === DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLYING) {
    return {
      summary: 'Übernahme läuft — einzelne Aktionen werden nacheinander ausgeführt.',
      detailSummary:
        'Dieser Schritt kann nicht abgebrochen werden. Bitte warten Sie, bis alle Aktionen abgeschlossen sind.',
    };
  }

  if (input.applyFailed) {
    return {
      summary: 'Übernahme fehlgeschlagen — erforderliche Aktionen konnten nicht abgeschlossen werden.',
      detailSummary:
        input.failedCount > 0
          ? `${input.failedCount} Aktion(en) fehlgeschlagen. Sie können fehlgeschlagene Aktionen erneut versuchen, sobald die Ursache behoben ist.`
          : 'Bitte prüfen Sie die Meldungen und versuchen Sie es erneut.',
    };
  }

  if (input.partiallyApplied) {
    return {
      summary: 'Teilweise übernommen — einige optionale Aktionen sind fehlgeschlagen.',
      detailSummary:
        `${input.succeededCount} Aktion(en) erfolgreich, ${input.failedCount} fehlgeschlagen. Pflichtaktionen sind erfüllt; optionale Schritte können erneut versucht werden.`,
    };
  }

  if (input.extractionStatus === 'APPLIED' && input.requiredActionsComplete) {
    return {
      summary: 'Alle geplanten Pflichtaktionen wurden erfolgreich übernommen.',
      detailSummary: null,
    };
  }

  return {
    summary: 'Übernahme abgeschlossen.',
    detailSummary: null,
  };
}

export function buildPublicDocumentApplyResult(record: ApplyResultRecord): PublicDocumentApplyResultDto | null {
  const state = readDocumentActionPlanState(record.plausibility);
  const lifecycle = state.actionPlanApplyLifecycle;
  const plan = state.actionPlan;
  const execution = state.actionPlanExecution;

  if (!lifecycle && !execution && !plan) {
    if (record.status === 'APPLIED') {
      return {
        lifecycleStatus: DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLIED,
        extractionStatus: record.status,
        summary: 'Dokument wurde übernommen.',
        detailSummary: null,
        isTerminal: true,
        applyingInProgress: false,
        nonCancellable: false,
        requiredActionsComplete: true,
        canRetryFailedActions: false,
        partiallyApplied: false,
        applyFailed: false,
        fingerprint: null,
        actions: [],
      };
    }
    return null;
  }

  const lifecycleStatus = lifecycle?.status ?? DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.READY_TO_APPLY;
  const applyingInProgress = lifecycleStatus === DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLYING;
  const applyFailed = lifecycleStatus === DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLY_FAILED;
  const partiallyApplied =
    lifecycleStatus === DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.PARTIALLY_APPLIED ||
    record.status === 'PARTIALLY_APPLIED';

  const plannedBySequence = new Map(
    (plan?.actions ?? []).map((action) => [action.sequence - 1, action]),
  );

  const actions: PublicDocumentApplyActionResultDto[] = (execution?.actions ?? []).map((row) => {
    const planned = plannedBySequence.get(row.actionIndex);
    const catalog = resolveActionCatalogEntry(row.semanticAction);
    const skippedByUser = row.output?.disabledByUser === true;
    return {
      actionIndex: row.actionIndex,
      semanticAction: row.semanticAction,
      labelKey: catalog.labelKey,
      title: catalog.title,
      requirement: row.requirement,
      status: mapExecutionStatus(row.status),
      targetModule: catalog.targetModule,
      targetModuleLabel: catalog.targetModuleLabel,
      resultEntityType: row.resultEntityType ?? null,
      resultEntityId: row.resultEntityId ?? null,
      entityLink:
        row.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED
          ? resolveEntityLink({
              semanticAction: row.semanticAction,
              resultEntityType: row.resultEntityType,
              resultEntityId: row.resultEntityId,
              output: row.output,
              vehicleId: record.vehicleId,
            })
          : null,
      errorCode: row.errorCode ?? null,
      errorMessage: row.errorMessage
        ? translateDocumentActionErrorCode(row.errorCode, row.errorMessage)
        : null,
      skippedReason: skippedByUser ? 'Vom Benutzer deaktiviert' : null,
    };
  });

  if (actions.length === 0 && plan) {
    for (const action of plan.actions) {
      actions.push({
        actionIndex: action.sequence - 1,
        semanticAction: action.semanticAction,
        labelKey: resolveActionCatalogEntry(action.semanticAction).labelKey,
        title: resolveActionCatalogEntry(action.semanticAction).title,
        requirement: action.requirement,
        status: applyingInProgress ? 'RUNNING' : 'PENDING',
        targetModule: resolveActionCatalogEntry(action.semanticAction).targetModule,
        targetModuleLabel: resolveActionCatalogEntry(action.semanticAction).targetModuleLabel,
        resultEntityType: null,
        resultEntityId: null,
        entityLink: null,
        errorCode: null,
        errorMessage: null,
        skippedReason: null,
      });
    }
  }

  const failedCount = actions.filter((row) => row.status === 'FAILED').length;
  const succeededCount = actions.filter((row) => row.status === 'SUCCEEDED').length;
  const requiredFailed = actions.some(
    (row) => row.requirement === 'REQUIRED' && row.status === 'FAILED',
  );
  const requiredActionsComplete = !requiredFailed && succeededCount > 0;

  const retryableFailed =
    execution != null ? listRetryableFailedActionIndices(execution.actions) : [];
  const canRetryFailedActions =
    retryableFailed.length > 0 &&
    (applyFailed || partiallyApplied) &&
    !applyingInProgress;

  const isTerminal =
    isTerminalApplyLifecycleStatus(lifecycleStatus as never) ||
    (record.status === 'APPLIED' && isSuccessfulApplyLifecycle(lifecycleStatus as never)) ||
    record.status === 'PARTIALLY_APPLIED';

  const { summary, detailSummary } = buildSummary({
    lifecycleStatus,
    extractionStatus: record.status,
    requiredActionsComplete,
    partiallyApplied,
    applyFailed,
    failedCount,
    succeededCount,
  });

  return {
    lifecycleStatus,
    extractionStatus: record.status,
    summary,
    detailSummary,
    isTerminal,
    applyingInProgress,
    nonCancellable: applyingInProgress,
    requiredActionsComplete,
    canRetryFailedActions,
    partiallyApplied,
    applyFailed,
    fingerprint: plan?.fingerprint ?? execution?.fingerprint ?? null,
    actions,
  };
}
