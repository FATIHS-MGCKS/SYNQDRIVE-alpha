import { randomUUID } from 'crypto';
import { assessArchivePlan, isArchiveDocumentProfile } from './document-action-planner.archive-rules';
import { assessDamagePlan, isDamageDocumentProfile } from './document-action-planner.damage-rules';
import { assessInspectionPlan, isInspectionDocumentProfile } from './document-action-planner.inspection-rules';
import {
  assessFinanceDraftRequirements,
  isFinanceDocumentProfile,
} from './document-action-planner.invoice-rules';
import { assessTechnicalPlan, isTechnicalDocumentProfile } from './document-action-planner.technical-rules';
import { assessFinePlan, isFineDocumentProfile } from './document-action-planner.fine-rules';
import {
  DOCUMENT_ACTION_PLAN_VERSION,
  computeActionPlanFingerprint,
  type BuildDocumentActionPlanInput,
  type DocumentActionPlan,
} from './document-action-plan.types';
import { DOCUMENT_ACTION_PLAN_STATUSES, type DocumentPlannedAction } from './document-action.types';
import { DocumentActionPlanError, DOCUMENT_ACTION_ERROR_CODES } from './document-action.errors';

type PlannerAssessment = {
  planOutcome: string;
  actions: Array<{ semanticAction: string; requirement: DocumentPlannedAction['requirement'] }>;
  metadata?: Record<string, unknown>;
};

function withSequences(
  actions: Array<{ semanticAction: string; requirement: DocumentPlannedAction['requirement'] }>,
): DocumentPlannedAction[] {
  return actions.map((action, index) => ({
    ...action,
    sequence: index + 1,
  }));
}

function assessPlanForDocumentType(input: BuildDocumentActionPlanInput): PlannerAssessment {
  const plannerInput = {
    effectiveDocumentType: input.documentType,
    confirmedData: input.confirmedData,
    plausibilityChecks: input.plausibilityChecks,
    ...(input.planContext ?? {}),
  };

  if (isArchiveDocumentProfile(plannerInput)) {
    const assessment = assessArchivePlan(plannerInput);
    return {
      planOutcome: assessment.planOutcome,
      actions: assessment.actions,
      metadata: {
        archiveSubtype: assessment.archiveSubtype,
        entityLinkSuggestions: assessment.entityLinkSuggestions,
        deadlineSuggestions: assessment.deadlineSuggestions,
        missingRequirements: assessment.missingRequirements,
      },
    };
  }

  if (isDamageDocumentProfile(plannerInput)) {
    const assessment = assessDamagePlan(plannerInput);
    return {
      planOutcome: assessment.planOutcome,
      actions: assessment.actions,
      metadata: {
        documentMode: assessment.documentMode,
        linkCandidateId: assessment.linkCandidateId,
        missingRequirements: assessment.missingRequirements,
      },
    };
  }

  if (isInspectionDocumentProfile(plannerInput)) {
    const assessment = assessInspectionPlan(plannerInput);
    return {
      planOutcome: assessment.planOutcome,
      actions: assessment.actions,
      metadata: {
        missingRequirements: assessment.missingRequirements,
      },
    };
  }

  if (isFinanceDocumentProfile(plannerInput)) {
    const assessment = assessFinanceDraftRequirements(plannerInput);
    return {
      planOutcome: assessment.planOutcome,
      actions: [],
      metadata: {
        missingRequirements: assessment.missingRequirements,
        amountTaxAssessment: assessment.amountTaxAssessment,
      },
    };
  }

  if (isFineDocumentProfile(plannerInput)) {
    const assessment = assessFinePlan(plannerInput);
    return {
      planOutcome: assessment.planOutcome,
      actions: assessment.actions,
      metadata: {
        duplicateReferenceFineId: assessment.duplicateReferenceFineId,
        missingRequirements: assessment.missingRequirements,
      },
    };
  }

  if (isTechnicalDocumentProfile(plannerInput)) {
    const assessment = assessTechnicalPlan(plannerInput);
    return {
      planOutcome: assessment.planOutcome,
      actions: assessment.actions,
      metadata: {
        missingRequirements: assessment.missingRequirements,
      },
    };
  }

  return {
    planOutcome: 'UNSUPPORTED',
    actions: [],
    metadata: { unsupportedDocumentType: input.documentType },
  };
}

export function buildDocumentActionPlan(input: BuildDocumentActionPlanInput): DocumentActionPlan {
  const assessment = assessPlanForDocumentType(input);
  const actions = withSequences(assessment.actions);
  const planVersion = DOCUMENT_ACTION_PLAN_VERSION;
  const fingerprint = computeActionPlanFingerprint({
    planVersion,
    extractionId: input.extractionId,
    documentType: input.documentType,
    planOutcome: assessment.planOutcome,
    actions,
    confirmedData: input.confirmedData,
  });

  return {
    planId: randomUUID(),
    planVersion,
    fingerprint,
    status: DOCUMENT_ACTION_PLAN_STATUSES.CONFIRMED,
    extractionId: input.extractionId,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    documentType: input.documentType,
    planOutcome: assessment.planOutcome,
    actions,
    confirmedAt: new Date().toISOString(),
    confirmedById: input.confirmedById ?? null,
    metadata: assessment.metadata,
  };
}

export function assertExecutableActionPlan(plan: DocumentActionPlan): void {
  if (plan.status === DOCUMENT_ACTION_PLAN_STATUSES.INVALIDATED) {
    throw new DocumentActionPlanError(
      DOCUMENT_ACTION_ERROR_CODES.PLAN_INVALIDATED,
      'Action plan was invalidated and cannot be executed',
      { planId: plan.planId, invalidationReason: plan.invalidationReason ?? null },
    );
  }

  if (
    plan.status !== DOCUMENT_ACTION_PLAN_STATUSES.CONFIRMED &&
    plan.status !== DOCUMENT_ACTION_PLAN_STATUSES.COMPLETED
  ) {
    throw new DocumentActionPlanError(
      DOCUMENT_ACTION_ERROR_CODES.PLAN_NOT_CONFIRMED,
      'Action plan must be confirmed before execution',
      { planId: plan.planId, status: plan.status },
    );
  }

  if (plan.planOutcome === 'BLOCKED' || plan.planOutcome.endsWith('_BLOCKED')) {
    throw new DocumentActionPlanError(
      DOCUMENT_ACTION_ERROR_CODES.PLAN_BLOCKED,
      'Action plan is blocked and cannot be executed',
      {
        planId: plan.planId,
        planOutcome: plan.planOutcome,
        missingRequirements: plan.metadata?.missingRequirements ?? [],
      },
    );
  }
}
