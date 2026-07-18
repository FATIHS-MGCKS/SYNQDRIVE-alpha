import {
  assessDamageApplyGate,
  buildDamageCreatePayload,
  DAMAGE_DOCUMENT_MODES,
  DAMAGE_DOCUMENT_TYPES,
  findLinkableDamageCandidate,
  isAccidentApplyConfirmed,
  isDamageDocumentType,
  isDamageSeverityConfirmed,
  isDamageTypeConfirmed,
  readDamageDescription,
  readInsuranceReference,
  readPoliceReference,
  readThirdPartyInvolved,
  resolveDamageDocumentMode,
  type DamageDocumentType,
  type ExistingDamageCandidate,
} from './document-damage-extraction.rules';
import { gateActionPlanOnPlausibility } from './document-plausibility-gate.util';

export {
  DAMAGE_DOCUMENT_MODES,
  DAMAGE_DOCUMENT_TYPES,
  type DamageDocumentType,
} from './document-damage-extraction.rules';

export const DAMAGE_SEMANTIC_ACTIONS = {
  CREATE_DAMAGE_DRAFT: 'CREATE_DAMAGE_DRAFT',
  CREATE_DAMAGE_RECORD: 'CREATE_DAMAGE_RECORD',
  LINK_EXISTING_DAMAGE: 'LINK_EXISTING_DAMAGE',
  SUGGEST_VEHICLE_INSPECTION: 'SUGGEST_VEHICLE_INSPECTION',
  SUGGEST_INSURANCE_NOTIFICATION: 'SUGGEST_INSURANCE_NOTIFICATION',
  ARCHIVE_DOCUMENT: 'ARCHIVE_DOCUMENT',
} as const;

export type DamageSemanticAction =
  (typeof DAMAGE_SEMANTIC_ACTIONS)[keyof typeof DAMAGE_SEMANTIC_ACTIONS];

export const DAMAGE_PLAN_OUTCOMES = {
  READY: 'READY',
  DRAFT_ONLY: 'DRAFT_ONLY',
  BLOCKED: 'BLOCKED',
} as const;

export type DamagePlanOutcome =
  (typeof DAMAGE_PLAN_OUTCOMES)[keyof typeof DAMAGE_PLAN_OUTCOMES];

export type DamagePlannerInput = {
  effectiveDocumentType: string;
  confirmedData: Record<string, unknown>;
  existingDamages?: ExistingDamageCandidate[];
  duplicateDamageId?: string | null;
  plausibilityChecks?: import('./document-plausibility.types').PlausibilityCheck[];
};

export type DamagePlannedAction = {
  semanticAction: DamageSemanticAction;
  requirement: 'REQUIRED' | 'OPTIONAL' | 'INFORMATIONAL';
};

export type DamagePlanAssessment = {
  documentType: DamageDocumentType;
  documentMode: ReturnType<typeof resolveDamageDocumentMode>;
  planOutcome: DamagePlanOutcome;
  actions: DamagePlannedAction[];
  linkCandidateId: string | null;
  missingRequirements: Array<{ code: string; message: string; fieldKeys?: string[] }>;
};

export function isDamageDocumentProfile(input: DamagePlannerInput): boolean {
  return isDamageDocumentType(input.effectiveDocumentType);
}

export function assessDamagePlan(input: DamagePlannerInput): DamagePlanAssessment {
  const documentType = input.effectiveDocumentType as DamageDocumentType;
  const documentMode = resolveDamageDocumentMode(documentType, input.confirmedData);
  const gate = assessDamageApplyGate({
    documentType,
    fields: input.confirmedData,
    duplicateDamageId: input.duplicateDamageId,
  });

  const actions: DamagePlannedAction[] = [];
  const missingRequirements: DamagePlanAssessment['missingRequirements'] = [];
  const linkCandidate =
    input.existingDamages && input.existingDamages.length > 0
      ? findLinkableDamageCandidate(input.existingDamages, input.confirmedData)
      : null;

  if (gate.canCreateDraft) {
    actions.push({
      semanticAction: DAMAGE_SEMANTIC_ACTIONS.CREATE_DAMAGE_DRAFT,
      requirement: 'REQUIRED',
    });
    actions.push({
      semanticAction: DAMAGE_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT,
      requirement: 'INFORMATIONAL',
    });
  }

  if (linkCandidate) {
    actions.push({
      semanticAction: DAMAGE_SEMANTIC_ACTIONS.LINK_EXISTING_DAMAGE,
      requirement: 'OPTIONAL',
    });
  }

  if (gate.canApply && buildDamageCreatePayload(input.confirmedData)) {
    actions.push({
      semanticAction: DAMAGE_SEMANTIC_ACTIONS.CREATE_DAMAGE_RECORD,
      requirement: 'REQUIRED',
    });
  } else {
    missingRequirements.push(
      ...gate.blockers.map((blocker) => ({
        code: blocker.code,
        message: blocker.message,
        fieldKeys: blocker.fieldKeys,
      })),
    );
  }

  if (readThirdPartyInvolved(input.confirmedData) || documentMode === DAMAGE_DOCUMENT_MODES.ACCIDENT_REPORT) {
    actions.push({
      semanticAction: DAMAGE_SEMANTIC_ACTIONS.SUGGEST_VEHICLE_INSPECTION,
      requirement: 'OPTIONAL',
    });
  }

  if (readInsuranceReference(input.confirmedData) || readPoliceReference(input.confirmedData)) {
    actions.push({
      semanticAction: DAMAGE_SEMANTIC_ACTIONS.SUGGEST_INSURANCE_NOTIFICATION,
      requirement: 'OPTIONAL',
    });
  }

  let planOutcome: DamagePlanOutcome = DAMAGE_PLAN_OUTCOMES.DRAFT_ONLY;
  if (!gate.canCreateDraft) {
    planOutcome = DAMAGE_PLAN_OUTCOMES.BLOCKED;
  } else if (gate.canApply) {
    planOutcome = DAMAGE_PLAN_OUTCOMES.READY;
  } else if (
    documentMode === DAMAGE_DOCUMENT_MODES.ACCIDENT_REPORT &&
    !isAccidentApplyConfirmed(input.confirmedData)
  ) {
    planOutcome = DAMAGE_PLAN_OUTCOMES.DRAFT_ONLY;
  } else if (
    documentMode === DAMAGE_DOCUMENT_MODES.APPRAISAL ||
    !isDamageTypeConfirmed(input.confirmedData) ||
    !isDamageSeverityConfirmed(input.confirmedData)
  ) {
    planOutcome = DAMAGE_PLAN_OUTCOMES.DRAFT_ONLY;
  }

  if (input.duplicateDamageId) {
    planOutcome = DAMAGE_PLAN_OUTCOMES.BLOCKED;
  }

  return gateActionPlanOnPlausibility(
    {
      documentType,
      documentMode,
      planOutcome,
      actions,
      linkCandidateId: linkCandidate?.id ?? null,
      missingRequirements,
    },
    input.plausibilityChecks ?? [],
  );
}

export function buildDamagePlannerSummary(assessment: DamagePlanAssessment): string {
  if (assessment.planOutcome === DAMAGE_PLAN_OUTCOMES.BLOCKED) {
    return 'Damage plan blocked — duplicate case or incomplete traceable damage evidence.';
  }
  if (assessment.documentMode === DAMAGE_DOCUMENT_MODES.ACCIDENT_REPORT) {
    return 'Accident report plan — draft first, apply only after explicit confirmation.';
  }
  if (assessment.documentMode === DAMAGE_DOCUMENT_MODES.APPRAISAL) {
    return 'Appraisal/gutachten plan — link to existing damage case, no duplicate create.';
  }
  if (assessment.planOutcome === DAMAGE_PLAN_OUTCOMES.DRAFT_ONLY) {
    return 'Damage plan draft-only — type/severity confirmation required.';
  }
  return `Damage plan ready (${assessment.actions.length} actions).`;
}
