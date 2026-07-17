import {
  assessFineApplyGate,
  buildFineApplyPayload,
  isFineDocumentType,
  readAcceptedEntityLinks,
} from './document-fine-extraction.rules';
import { gateActionPlanOnPlausibility } from './document-plausibility-gate.util';

export const FINE_SEMANTIC_ACTIONS = {
  CREATE_FINE_DRAFT: 'CREATE_FINE_DRAFT',
  SUGGEST_ENTITY_LINK: 'SUGGEST_ENTITY_LINK',
  SUGGEST_DRIVER_ASSIGNMENT: 'SUGGEST_DRIVER_ASSIGNMENT',
} as const;

export type FineSemanticAction =
  (typeof FINE_SEMANTIC_ACTIONS)[keyof typeof FINE_SEMANTIC_ACTIONS];

export const FINE_PLAN_OUTCOMES = {
  READY: 'READY',
  BLOCKED: 'BLOCKED',
} as const;

export type FinePlanOutcome = (typeof FINE_PLAN_OUTCOMES)[keyof typeof FINE_PLAN_OUTCOMES];

export type FinePlannerInput = {
  effectiveDocumentType: string;
  confirmedData: Record<string, unknown>;
  duplicateReferenceFineId?: string | null;
  plausibilityChecks?: import('./document-plausibility.types').PlausibilityCheck[];
};

export type FinePlannedAction = {
  semanticAction: FineSemanticAction;
  requirement: 'REQUIRED' | 'OPTIONAL' | 'INFORMATIONAL';
};

export type FinePlanAssessment = {
  documentType: typeof import('./document-fine-extraction.rules').FINE_DOCUMENT_TYPE;
  planOutcome: FinePlanOutcome;
  actions: FinePlannedAction[];
  duplicateReferenceFineId: string | null;
  missingRequirements: Array<{ code: string; message: string; fieldKeys?: string[] }>;
};

export function isFineDocumentProfile(input: FinePlannerInput): boolean {
  return isFineDocumentType(input.effectiveDocumentType);
}

export function assessFinePlan(input: FinePlannerInput): FinePlanAssessment {
  const gate = assessFineApplyGate({
    fields: input.confirmedData,
    duplicateReferenceFineId: input.duplicateReferenceFineId,
  });
  const payload = buildFineApplyPayload(input.confirmedData);
  const actions: FinePlannedAction[] = [];
  const missingRequirements = gate.blockers.map((blocker) => ({
    code: blocker.code,
    message: blocker.message,
    fieldKeys: blocker.fieldKeys,
  }));

  if (gate.canApply && payload) {
    actions.push({
      semanticAction: FINE_SEMANTIC_ACTIONS.CREATE_FINE_DRAFT,
      requirement: 'REQUIRED',
    });
  }

  const acceptedLinks = readAcceptedEntityLinks(input.confirmedData);
  if (acceptedLinks.length > 0) {
    actions.push({
      semanticAction: FINE_SEMANTIC_ACTIONS.SUGGEST_ENTITY_LINK,
      requirement: 'OPTIONAL',
    });
  } else if (
    payload?.entityLinks.bookingId ||
    payload?.entityLinks.customerId ||
    payload?.entityLinks.driverCustomerId
  ) {
    actions.push({
      semanticAction: FINE_SEMANTIC_ACTIONS.SUGGEST_ENTITY_LINK,
      requirement: 'OPTIONAL',
    });
  }

  if (!payload?.entityLinks.driverCustomerId) {
    actions.push({
      semanticAction: FINE_SEMANTIC_ACTIONS.SUGGEST_DRIVER_ASSIGNMENT,
      requirement: 'INFORMATIONAL',
    });
  }

  const planOutcome = gate.canApply ? FINE_PLAN_OUTCOMES.READY : FINE_PLAN_OUTCOMES.BLOCKED;

  return gateActionPlanOnPlausibility(
    {
      documentType: 'FINE',
      planOutcome,
      actions,
      duplicateReferenceFineId: gate.duplicateReferenceFineId,
      missingRequirements,
    },
    input.plausibilityChecks ?? [],
  );
}

export function buildFinePlannerSummary(assessment: FinePlanAssessment): string {
  if (assessment.planOutcome === FINE_PLAN_OUTCOMES.BLOCKED) {
    return 'Fine plan blocked — required offense metadata missing or duplicate reference number.';
  }
  return `Fine draft plan: create UNDER_REVIEW fine draft and optional entity-link follow-up.`;
}
