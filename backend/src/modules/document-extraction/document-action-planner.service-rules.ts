import {
  assessServiceApplyGate,
  isServiceDocumentType,
  readServiceEventDate,
  SERVICE_DOCUMENT_TYPES,
  type ServiceDocumentType,
} from './document-service-extraction.rules';
import { gateActionPlanOnPlausibility } from './document-plausibility-gate.util';

export {
  SERVICE_DOCUMENT_TYPES,
  type ServiceDocumentType,
} from './document-service-extraction.rules';

export const SERVICE_SEMANTIC_ACTIONS = {
  CREATE_SERVICE_EVENT: 'CREATE_SERVICE_EVENT',
  REFRESH_VEHICLE_SERVICE_HISTORY: 'REFRESH_VEHICLE_SERVICE_HISTORY',
  ARCHIVE_DOCUMENT: 'ARCHIVE_DOCUMENT',
} as const;

export type ServiceSemanticAction =
  (typeof SERVICE_SEMANTIC_ACTIONS)[keyof typeof SERVICE_SEMANTIC_ACTIONS];

export const SERVICE_PLAN_OUTCOMES = {
  READY: 'READY',
  BLOCKED: 'BLOCKED',
} as const;

export type ServicePlanOutcome = (typeof SERVICE_PLAN_OUTCOMES)[keyof typeof SERVICE_PLAN_OUTCOMES];

export type ServicePlannerInput = {
  effectiveDocumentType: string;
  confirmedData: Record<string, unknown>;
  plausibilityChecks?: import('./document-plausibility.types').PlausibilityCheck[];
};

export type ServicePlannedAction = {
  semanticAction: ServiceSemanticAction;
  requirement: 'REQUIRED' | 'OPTIONAL' | 'INFORMATIONAL';
};

export type ServicePlanAssessment = {
  documentType: ServiceDocumentType;
  planOutcome: ServicePlanOutcome;
  actions: ServicePlannedAction[];
  missingRequirements: Array<{ code: string; message: string; fieldKeys?: string[] }>;
};

export function isServiceDocumentProfile(input: ServicePlannerInput): boolean {
  return isServiceDocumentType(input.effectiveDocumentType);
}

export function assessServicePlan(input: ServicePlannerInput): ServicePlanAssessment {
  const documentType = input.effectiveDocumentType as ServiceDocumentType;
  const gate = assessServiceApplyGate({
    documentType,
    fields: input.confirmedData,
  });
  const actions: ServicePlannedAction[] = [];
  const missingRequirements: ServicePlanAssessment['missingRequirements'] = [];

  if (!gate.canApply) {
    for (const blocker of gate.blockers) {
      missingRequirements.push({
        code: blocker.code,
        message: blocker.message,
        fieldKeys: blocker.fieldKeys,
      });
    }

    return gateActionPlanOnPlausibility(
      {
        documentType,
        planOutcome: SERVICE_PLAN_OUTCOMES.BLOCKED,
        actions: [],
        missingRequirements,
      },
      input.plausibilityChecks ?? [],
    );
  }

  actions.push({
    semanticAction: SERVICE_SEMANTIC_ACTIONS.CREATE_SERVICE_EVENT,
    requirement: 'REQUIRED',
  });
  actions.push({
    semanticAction: SERVICE_SEMANTIC_ACTIONS.REFRESH_VEHICLE_SERVICE_HISTORY,
    requirement: 'REQUIRED',
  });
  actions.push({
    semanticAction: SERVICE_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT,
    requirement: 'INFORMATIONAL',
  });

  if (!readServiceEventDate(input.confirmedData)) {
    missingRequirements.push({
      code: 'MISSING_EVENT_DATE',
      message: 'Event date is required before service history can be refreshed.',
      fieldKeys: ['eventDate'],
    });
  }

  return gateActionPlanOnPlausibility(
    {
      documentType,
      planOutcome: SERVICE_PLAN_OUTCOMES.READY,
      actions,
      missingRequirements,
    },
    input.plausibilityChecks ?? [],
  );
}
