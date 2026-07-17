import {
  assessInspectionApplyGate,
  buildInspectionVehicleComplianceUpdate,
  hasDefects,
  hasExplicitValidUntil,
  INSPECTION_DOCUMENT_TYPES,
  isInspectionDocumentType,
  readInspectionDate,
  readReinspectionDeadline,
  readReinspectionRequired,
  readReportNumber,
  type InspectionDocumentType,
} from './document-inspection-extraction.rules';
import { gateActionPlanOnPlausibility } from './document-plausibility-gate.util';

export {
  INSPECTION_DOCUMENT_TYPES,
  type InspectionDocumentType,
} from './document-inspection-extraction.rules';

export const INSPECTION_SEMANTIC_ACTIONS = {
  CREATE_COMPLIANCE_SERVICE_EVENT: 'CREATE_COMPLIANCE_SERVICE_EVENT',
  UPDATE_VEHICLE_COMPLIANCE_DATES: 'UPDATE_VEHICLE_COMPLIANCE_DATES',
  SUGGEST_DEFECT_REMEDIATION: 'SUGGEST_DEFECT_REMEDIATION',
  SUGGEST_REINSPECTION: 'SUGGEST_REINSPECTION',
  ARCHIVE_DOCUMENT: 'ARCHIVE_DOCUMENT',
} as const;

export type InspectionSemanticAction =
  (typeof INSPECTION_SEMANTIC_ACTIONS)[keyof typeof INSPECTION_SEMANTIC_ACTIONS];

export const INSPECTION_PLAN_OUTCOMES = {
  READY: 'READY',
  ARCHIVE_ONLY: 'ARCHIVE_ONLY',
  DRAFT_ONLY: 'DRAFT_ONLY',
  BLOCKED: 'BLOCKED',
} as const;

export type InspectionPlanOutcome =
  (typeof INSPECTION_PLAN_OUTCOMES)[keyof typeof INSPECTION_PLAN_OUTCOMES];

export type InspectionPlannerInput = {
  effectiveDocumentType: string;
  confirmedData: Record<string, unknown>;
  complianceReadinessBlocked?: boolean;
  plausibilityChecks?: import('./document-plausibility.types').PlausibilityCheck[];
};

export type InspectionPlannedAction = {
  semanticAction: InspectionSemanticAction;
  requirement: 'REQUIRED' | 'OPTIONAL' | 'INFORMATIONAL';
};

export type InspectionPlanAssessment = {
  documentType: InspectionDocumentType;
  planOutcome: InspectionPlanOutcome;
  actions: InspectionPlannedAction[];
  canUpdateVehicleMasterData: boolean;
  missingRequirements: Array<{ code: string; message: string; fieldKeys?: string[] }>;
};

export function isInspectionDocumentProfile(input: InspectionPlannerInput): boolean {
  return isInspectionDocumentType(input.effectiveDocumentType);
}

export function assessInspectionPlan(input: InspectionPlannerInput): InspectionPlanAssessment {
  const documentType = input.effectiveDocumentType as InspectionDocumentType;
  const gate = assessInspectionApplyGate({
    documentType,
    fields: input.confirmedData,
    complianceReadinessBlocked: input.complianceReadinessBlocked,
  });

  const actions: InspectionPlannedAction[] = [];
  const missingRequirements: InspectionPlanAssessment['missingRequirements'] = [];

  if (gate.blockers.some((blocker) => blocker.code === 'COMPLIANCE_READINESS_BLOCKED')) {
    return {
      documentType,
      planOutcome: INSPECTION_PLAN_OUTCOMES.BLOCKED,
      actions: [],
      canUpdateVehicleMasterData: false,
      missingRequirements: gate.blockers.map((blocker) => ({
        code: blocker.code,
        message: blocker.message,
        fieldKeys: blocker.fieldKeys,
      })),
    };
  }

  actions.push({
    semanticAction: INSPECTION_SEMANTIC_ACTIONS.CREATE_COMPLIANCE_SERVICE_EVENT,
    requirement: 'REQUIRED',
  });

  actions.push({
    semanticAction: INSPECTION_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT,
    requirement: 'INFORMATIONAL',
  });

  const complianceUpdate = buildInspectionVehicleComplianceUpdate(
    documentType,
    input.confirmedData,
  );

  if (gate.canUpdateVehicleMasterData && complianceUpdate) {
    actions.push({
      semanticAction: INSPECTION_SEMANTIC_ACTIONS.UPDATE_VEHICLE_COMPLIANCE_DATES,
      requirement: 'REQUIRED',
    });
  } else if (!hasExplicitValidUntil(input.confirmedData)) {
    missingRequirements.push({
      code: 'MISSING_VALID_UNTIL',
      message: 'Vehicle compliance dates cannot be updated without validUntil.',
      fieldKeys: ['validUntil'],
    });
  }

  if (hasDefects(input.confirmedData)) {
    actions.push({
      semanticAction: INSPECTION_SEMANTIC_ACTIONS.SUGGEST_DEFECT_REMEDIATION,
      requirement: 'OPTIONAL',
    });
    if (readReinspectionRequired(input.confirmedData)) {
      actions.push({
        semanticAction: INSPECTION_SEMANTIC_ACTIONS.SUGGEST_REINSPECTION,
        requirement: 'OPTIONAL',
      });
    }
  }

  let planOutcome: InspectionPlanOutcome = INSPECTION_PLAN_OUTCOMES.READY;
  if (!gate.canArchive) {
    planOutcome = INSPECTION_PLAN_OUTCOMES.BLOCKED;
  } else if (!gate.canUpdateVehicleMasterData) {
    planOutcome = INSPECTION_PLAN_OUTCOMES.ARCHIVE_ONLY;
  } else if (!readInspectionDate(input.confirmedData) || !readReportNumber(input.confirmedData)) {
    planOutcome = INSPECTION_PLAN_OUTCOMES.DRAFT_ONLY;
  }

  if (
    hasDefects(input.confirmedData) &&
    readReinspectionRequired(input.confirmedData) &&
    !readReinspectionDeadline(input.confirmedData)
  ) {
    planOutcome =
      planOutcome === INSPECTION_PLAN_OUTCOMES.READY
        ? INSPECTION_PLAN_OUTCOMES.DRAFT_ONLY
        : planOutcome;
  }

  return gateActionPlanOnPlausibility(
    {
      documentType,
      planOutcome,
      actions,
      canUpdateVehicleMasterData: gate.canUpdateVehicleMasterData,
      missingRequirements,
    },
    input.plausibilityChecks ?? [],
  );
}

export function buildInspectionPlannerSummary(
  assessment: InspectionPlanAssessment,
): string {
  if (assessment.planOutcome === INSPECTION_PLAN_OUTCOMES.BLOCKED) {
    return 'Inspection plan blocked by compliance readiness policy.';
  }
  if (assessment.planOutcome === INSPECTION_PLAN_OUTCOMES.ARCHIVE_ONLY) {
    return 'Inspection plan archive-only: missing validUntil prevents vehicle master data update.';
  }
  if (assessment.actions.some((action) => action.semanticAction === INSPECTION_SEMANTIC_ACTIONS.SUGGEST_DEFECT_REMEDIATION)) {
    return `Inspection plan with defect follow-up suggestions (${assessment.actions.length} actions).`;
  }
  return `Inspection plan ready (${assessment.actions.length} actions).`;
}
