import {
  assessBatteryApplyGate,
  buildBatteryApplyPayload,
} from './document-battery-extraction.rules';
import {
  assessBrakeApplyGate,
  buildBrakeApplyPayload,
} from './document-brake-extraction.rules';
import {
  assessTireApplyGate,
  buildTireMeasurementApplyPayload,
} from './document-tire-extraction.rules';
import { gateActionPlanOnPlausibility } from './document-plausibility-gate.util';

export const TECHNICAL_DOCUMENT_TYPES = {
  TIRE: 'TIRE',
  BRAKE: 'BRAKE',
  BATTERY: 'BATTERY',
} as const;

export type TechnicalDocumentType =
  (typeof TECHNICAL_DOCUMENT_TYPES)[keyof typeof TECHNICAL_DOCUMENT_TYPES];

export const TECHNICAL_SEMANTIC_ACTIONS = {
  APPLY_TIRE_MEASUREMENT: 'APPLY_TIRE_MEASUREMENT',
  APPLY_BRAKE_MEASUREMENT: 'APPLY_BRAKE_MEASUREMENT',
  APPLY_BATTERY_MEASUREMENT: 'APPLY_BATTERY_MEASUREMENT',
  SUGGEST_TIRE_FOLLOWUP: 'SUGGEST_TIRE_FOLLOWUP',
  SUGGEST_BRAKE_FOLLOWUP: 'SUGGEST_BRAKE_FOLLOWUP',
  SUGGEST_BATTERY_FOLLOWUP: 'SUGGEST_BATTERY_FOLLOWUP',
  ARCHIVE_DOCUMENT: 'ARCHIVE_DOCUMENT',
} as const;

export type TechnicalSemanticAction =
  (typeof TECHNICAL_SEMANTIC_ACTIONS)[keyof typeof TECHNICAL_SEMANTIC_ACTIONS];

export const TECHNICAL_PLAN_OUTCOMES = {
  READY: 'READY',
  ARCHIVE_ONLY: 'ARCHIVE_ONLY',
  BLOCKED: 'BLOCKED',
} as const;

export type TechnicalPlanOutcome =
  (typeof TECHNICAL_PLAN_OUTCOMES)[keyof typeof TECHNICAL_PLAN_OUTCOMES];

export type TechnicalPlannerInput = {
  effectiveDocumentType: string;
  confirmedData: Record<string, unknown>;
  plausibilityChecks?: import('./document-plausibility.types').PlausibilityCheck[];
};

export type TechnicalPlannedAction = {
  semanticAction: TechnicalSemanticAction;
  requirement: 'REQUIRED' | 'OPTIONAL' | 'INFORMATIONAL';
};

export type TechnicalPlanAssessment = {
  documentType: TechnicalDocumentType;
  planOutcome: TechnicalPlanOutcome;
  actions: TechnicalPlannedAction[];
  missingRequirements: Array<{ code: string; message: string; fieldKeys?: string[] }>;
};

function isTechnicalDocumentType(
  value: string,
): value is TechnicalDocumentType {
  return (
    value === TECHNICAL_DOCUMENT_TYPES.TIRE ||
    value === TECHNICAL_DOCUMENT_TYPES.BRAKE ||
    value === TECHNICAL_DOCUMENT_TYPES.BATTERY
  );
}

export { isTechnicalDocumentType };

function assessGate(documentType: TechnicalDocumentType, fields: Record<string, unknown>) {
  if (documentType === TECHNICAL_DOCUMENT_TYPES.TIRE) {
    return assessTireApplyGate({ fields });
  }
  if (documentType === TECHNICAL_DOCUMENT_TYPES.BRAKE) {
    return assessBrakeApplyGate({ fields });
  }
  return assessBatteryApplyGate({ fields });
}

function hasApplyPayload(documentType: TechnicalDocumentType, fields: Record<string, unknown>) {
  if (documentType === TECHNICAL_DOCUMENT_TYPES.TIRE) {
    return buildTireMeasurementApplyPayload(fields) != null;
  }
  if (documentType === TECHNICAL_DOCUMENT_TYPES.BRAKE) {
    return buildBrakeApplyPayload(fields) != null;
  }
  return buildBatteryApplyPayload(fields) != null;
}

export function isTechnicalDocumentProfile(input: TechnicalPlannerInput): boolean {
  return isTechnicalDocumentType(input.effectiveDocumentType);
}

export function assessTechnicalPlan(input: TechnicalPlannerInput): TechnicalPlanAssessment {
  const documentType = input.effectiveDocumentType as TechnicalDocumentType;
  const gate = assessGate(documentType, input.confirmedData);
  const actions: TechnicalPlannedAction[] = [];
  const missingRequirements: TechnicalPlanAssessment['missingRequirements'] = [];

  actions.push({
    semanticAction: TECHNICAL_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT,
    requirement: 'INFORMATIONAL',
  });

  if (gate.canApply && hasApplyPayload(documentType, input.confirmedData)) {
    if (documentType === TECHNICAL_DOCUMENT_TYPES.TIRE) {
      actions.push({
        semanticAction: TECHNICAL_SEMANTIC_ACTIONS.APPLY_TIRE_MEASUREMENT,
        requirement: 'REQUIRED',
      });
    } else if (documentType === TECHNICAL_DOCUMENT_TYPES.BRAKE) {
      actions.push({
        semanticAction: TECHNICAL_SEMANTIC_ACTIONS.APPLY_BRAKE_MEASUREMENT,
        requirement: 'REQUIRED',
      });
    } else {
      actions.push({
        semanticAction: TECHNICAL_SEMANTIC_ACTIONS.APPLY_BATTERY_MEASUREMENT,
        requirement: 'REQUIRED',
      });
    }
  } else {
    missingRequirements.push(
      ...gate.blockers.map((blocker) => ({
        code: blocker.code,
        message: blocker.message,
        fieldKeys: blocker.fieldKeys,
      })),
    );
  }

  if (documentType === TECHNICAL_DOCUMENT_TYPES.TIRE) {
    actions.push({
      semanticAction: TECHNICAL_SEMANTIC_ACTIONS.SUGGEST_TIRE_FOLLOWUP,
      requirement: 'OPTIONAL',
    });
  } else if (documentType === TECHNICAL_DOCUMENT_TYPES.BRAKE) {
    actions.push({
      semanticAction: TECHNICAL_SEMANTIC_ACTIONS.SUGGEST_BRAKE_FOLLOWUP,
      requirement: 'OPTIONAL',
    });
  } else {
    actions.push({
      semanticAction: TECHNICAL_SEMANTIC_ACTIONS.SUGGEST_BATTERY_FOLLOWUP,
      requirement: 'OPTIONAL',
    });
  }

  let planOutcome: TechnicalPlanOutcome = TECHNICAL_PLAN_OUTCOMES.ARCHIVE_ONLY;
  if (gate.canApply) {
    planOutcome = TECHNICAL_PLAN_OUTCOMES.READY;
  } else if (!gate.canArchive) {
    planOutcome = TECHNICAL_PLAN_OUTCOMES.BLOCKED;
  } else if (
    gate.blockers.some(
      (blocker) =>
        blocker.code === 'BATTERY_LV_SOH_BLOCKED' ||
        blocker.code === 'BATTERY_SCOPE_REQUIRED' ||
        blocker.code === 'TIRE_MISSING_TREAD_UNIT' ||
        blocker.code === 'BRAKE_AXLE_NOT_STATED',
    )
  ) {
    planOutcome = TECHNICAL_PLAN_OUTCOMES.BLOCKED;
  }

  return gateActionPlanOnPlausibility(
    {
      documentType,
      planOutcome,
      actions,
      missingRequirements,
    },
    input.plausibilityChecks ?? [],
  );
}

export function buildTechnicalPlannerSummary(assessment: TechnicalPlanAssessment): string {
  if (assessment.planOutcome === TECHNICAL_PLAN_OUTCOMES.BLOCKED) {
    return `Technical plan blocked for ${assessment.documentType} — confirmed fields are incomplete or invalid.`;
  }
  if (assessment.planOutcome === TECHNICAL_PLAN_OUTCOMES.ARCHIVE_ONLY) {
    return `Technical plan archive-only for ${assessment.documentType} — measurement date or required units are missing.`;
  }
  return `Technical plan ready for ${assessment.documentType} (${assessment.actions.length} actions).`;
}
