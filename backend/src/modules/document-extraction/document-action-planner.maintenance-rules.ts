import type { DocumentEntityType, DocumentExtractionType } from '@prisma/client';
import type { PlannedDocumentActionInput } from './document-action.types';
import type {
  DocumentActionBlockingReason,
  DocumentActionMissingRequirement,
  DocumentActionPlannerBuildContext,
  DocumentActionPlannerInput,
  DocumentFollowUpCandidateType,
} from './document-action-planner.types';

export const MAINTENANCE_SEMANTIC_ACTIONS = {
  CREATE_SERVICE_EVENT: 'CREATE_SERVICE_EVENT',
  UPDATE_TUV_COMPLIANCE: 'UPDATE_TUV_COMPLIANCE',
  UPDATE_BOKRAFT_COMPLIANCE: 'UPDATE_BOKRAFT_COMPLIANCE',
  CREATE_DAMAGE_DRAFT: 'CREATE_DAMAGE_DRAFT',
  CREATE_INSPECTION_DRAFT: 'CREATE_INSPECTION_DRAFT',
  LINK_VEHICLE: 'LINK_VEHICLE',
  LINK_BOOKING: 'LINK_BOOKING',
  SUGGEST_REPAIR_TASK: 'SUGGEST_REPAIR_TASK',
  SUGGEST_VEHICLE_INSPECTION: 'SUGGEST_VEHICLE_INSPECTION',
  SUGGEST_INSURANCE_REVIEW: 'SUGGEST_INSURANCE_REVIEW',
} as const;

export type MaintenanceSemanticAction =
  (typeof MAINTENANCE_SEMANTIC_ACTIONS)[keyof typeof MAINTENANCE_SEMANTIC_ACTIONS];

export const MAINTENANCE_DOCUMENT_TYPES = new Set<DocumentExtractionType>([
  'SERVICE',
  'OIL_CHANGE',
  'TUV_REPORT',
  'BOKRAFT_REPORT',
  'DAMAGE',
  'ACCIDENT',
  'VEHICLE_CONDITION',
]);

const INSPECTION_FAIL_SUBTYPES = new Set(['INSPECTION_FAIL', 'FAILED', 'WITH_DEFECTS', 'MANGEL']);

const LINK_ENTITY_TYPES: DocumentEntityType[] = ['VEHICLE', 'BOOKING'];

const SEMANTIC_LINK_BY_ENTITY: Record<DocumentEntityType, MaintenanceSemanticAction> = {
  VEHICLE: MAINTENANCE_SEMANTIC_ACTIONS.LINK_VEHICLE,
  BOOKING: MAINTENANCE_SEMANTIC_ACTIONS.LINK_BOOKING,
  CUSTOMER: MAINTENANCE_SEMANTIC_ACTIONS.LINK_BOOKING,
  DRIVER: MAINTENANCE_SEMANTIC_ACTIONS.LINK_BOOKING,
  VENDOR: MAINTENANCE_SEMANTIC_ACTIONS.LINK_VEHICLE,
  ORGANIZATION: MAINTENANCE_SEMANTIC_ACTIONS.LINK_VEHICLE,
};

export function isMaintenanceDocumentProfile(
  input: Pick<DocumentActionPlannerInput, 'effectiveDocumentType'>,
): boolean {
  const type = input.effectiveDocumentType;
  return type != null && MAINTENANCE_DOCUMENT_TYPES.has(type);
}

function hasNonEmptyField(data: Record<string, unknown>, key: string): boolean {
  const value = data[key];
  return value != null && value !== '';
}

function normalizeSubtype(subtype: string | null | undefined): string | null {
  if (!subtype?.trim()) return null;
  return subtype.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function hasConfirmedDefectStatus(
  input: Pick<DocumentActionPlannerInput, 'documentSubtype' | 'confirmedData'>,
): boolean {
  const normalizedSubtype = normalizeSubtype(input.documentSubtype);
  if (normalizedSubtype && INSPECTION_FAIL_SUBTYPES.has(normalizedSubtype)) {
    return true;
  }

  const data = input.confirmedData;
  if (hasNonEmptyField(data, 'defects')) {
    return true;
  }

  const result = String(data.result ?? '').toLowerCase();
  if (!result) return false;

  return (
    result.includes('mangel') ||
    result.includes('fail') ||
    result.includes('nicht bestanden') ||
    result.includes('defect') ||
    result.includes('durchgefallen')
  );
}

function hasConfirmedEntityLink(
  entityLinks: DocumentActionPlannerInput['entityLinks'],
  entityType: DocumentEntityType,
): boolean {
  return entityLinks.some(
    (link) => String(link.entityType).toUpperCase() === entityType && link.entityId?.trim(),
  );
}

function findUnconfirmedLinkCandidate(
  input: DocumentActionPlannerInput,
  entityType: DocumentEntityType,
): { entityId: string; confidence: number | null } | null {
  if (hasConfirmedEntityLink(input.entityLinks, entityType)) {
    return null;
  }

  const candidate = input.entityCandidates.find(
    (row) =>
      String(row.entityType).toUpperCase() === entityType &&
      row.entityId?.trim() &&
      String(row.status ?? 'PROPOSED').toUpperCase() !== 'REJECTED',
  );
  if (!candidate?.entityId?.trim()) return null;

  return {
    entityId: candidate.entityId.trim(),
    confidence: candidate.confidence ?? null,
  };
}

export type MaintenanceDraftRequirementAssessment = {
  missingRequirements: DocumentActionMissingRequirement[];
  canCreateServiceEvent: boolean;
  canUpdateTuvCompliance: boolean;
  canUpdateBokraftCompliance: boolean;
  canCreateDamageDraft: boolean;
  canCreateInspectionDraft: boolean;
  isReady: boolean;
};

export function assessMaintenanceDraftRequirements(
  input: DocumentActionPlannerInput,
): MaintenanceDraftRequirementAssessment {
  const routingType = input.effectiveDocumentType;
  const data = input.confirmedData;
  const missingRequirements: DocumentActionMissingRequirement[] = [];
  const missingFieldKeys: string[] = [];

  if (!routingType || !MAINTENANCE_DOCUMENT_TYPES.has(routingType)) {
    return {
      missingRequirements: [],
      canCreateServiceEvent: false,
      canUpdateTuvCompliance: false,
      canUpdateBokraftCompliance: false,
      canCreateDamageDraft: false,
      canCreateInspectionDraft: false,
      isReady: false,
    };
  }

  if (!hasConfirmedEntityLink(input.entityLinks, 'VEHICLE')) {
    missingRequirements.push({
      code: 'MISSING_CONFIRMED_VEHICLE_LINK',
      message: 'A confirmed VEHICLE entity link is required before maintenance apply.',
      entityType: 'VEHICLE',
    });
  }

  if (routingType === 'SERVICE' || routingType === 'OIL_CHANGE') {
    if (!hasNonEmptyField(data, 'eventDate')) missingFieldKeys.push('eventDate');
  }

  if (routingType === 'TUV_REPORT' || routingType === 'BOKRAFT_REPORT') {
    if (!hasNonEmptyField(data, 'eventDate')) missingFieldKeys.push('eventDate');
    if (!hasNonEmptyField(data, 'validUntil')) missingFieldKeys.push('validUntil');
  }

  if (routingType === 'DAMAGE') {
    if (!hasNonEmptyField(data, 'description')) missingFieldKeys.push('description');
  }

  if (routingType === 'ACCIDENT') {
    if (!hasNonEmptyField(data, 'eventDate')) missingFieldKeys.push('eventDate');
  }

  if (routingType === 'VEHICLE_CONDITION') {
    if (!hasNonEmptyField(data, 'eventDate')) missingFieldKeys.push('eventDate');
    if (!hasNonEmptyField(data, 'description')) missingFieldKeys.push('description');
  }

  if (missingFieldKeys.length > 0) {
    missingRequirements.push({
      code: 'MISSING_MAINTENANCE_DRAFT_FIELDS',
      message: `Missing required maintenance fields: ${missingFieldKeys.join(', ')}`,
      fieldKeys: missingFieldKeys,
    });
  }

  const vehicleReady = hasConfirmedEntityLink(input.entityLinks, 'VEHICLE');
  const fieldsReady = missingFieldKeys.length === 0;

  const canCreateServiceEvent =
    vehicleReady &&
    fieldsReady &&
    (routingType === 'SERVICE' || routingType === 'OIL_CHANGE' || routingType === 'TUV_REPORT' || routingType === 'BOKRAFT_REPORT');

  const canUpdateTuvCompliance =
    vehicleReady &&
    fieldsReady &&
    routingType === 'TUV_REPORT' &&
    hasNonEmptyField(data, 'validUntil');

  const canUpdateBokraftCompliance =
    vehicleReady &&
    fieldsReady &&
    routingType === 'BOKRAFT_REPORT' &&
    hasNonEmptyField(data, 'validUntil');

  const canCreateDamageDraft =
    vehicleReady && fieldsReady && routingType === 'DAMAGE';

  const canCreateInspectionDraft =
    vehicleReady && fieldsReady && routingType === 'VEHICLE_CONDITION';

  return {
    missingRequirements,
    canCreateServiceEvent,
    canUpdateTuvCompliance,
    canUpdateBokraftCompliance,
    canCreateDamageDraft,
    canCreateInspectionDraft,
    isReady:
      canCreateServiceEvent ||
      canUpdateTuvCompliance ||
      canUpdateBokraftCompliance ||
      canCreateDamageDraft ||
      canCreateInspectionDraft ||
      (vehicleReady && fieldsReady && routingType === 'ACCIDENT'),
  };
}

export function collectMaintenanceReadinessBlockers(
  input: DocumentActionPlannerInput,
): DocumentActionBlockingReason[] {
  const blockers: DocumentActionBlockingReason[] = [];
  const decision = input.applySafetyDecision ?? {};

  if (decision.canApply === false) {
    blockers.push({
      code: 'APPLY_SAFETY_BLOCKED',
      message: 'Apply safety decision blocks downstream execution.',
      source: 'REQUIREMENT',
      severity: 'BLOCKER',
    });
  }

  if (decision.readinessPolicyBlocked === true) {
    blockers.push({
      code: 'READINESS_POLICY_BLOCKED',
      message: String(
        decision.readinessPolicyMessage ??
          'Readiness policy blocks confirmed maintenance apply actions.',
      ),
      source: 'REQUIREMENT',
      severity: 'BLOCKER',
    });
  }

  if (decision.confirmedActionRequired === true && decision.actionConfirmed !== true) {
    blockers.push({
      code: 'CONFIRMED_ACTION_REQUIRED',
      message: 'Confirmed operator action is required before maintenance apply.',
      source: 'REQUIREMENT',
      severity: 'BLOCKER',
    });
  }

  return blockers;
}

function buildConfirmedFieldSnapshot(ctx: DocumentActionPlannerBuildContext): Record<string, unknown> {
  return {
    routingType: ctx.routingType,
    confirmedFieldKeys: Object.keys(ctx.input.confirmedData).sort(),
    note: 'Planner never substitutes the current date for missing document dates.',
  };
}

function buildServiceEventPayload(ctx: DocumentActionPlannerBuildContext): Record<string, unknown> {
  const data = ctx.input.confirmedData;
  return {
    semanticAction: MAINTENANCE_SEMANTIC_ACTIONS.CREATE_SERVICE_EVENT,
    eventDate: data.eventDate ?? null,
    odometerKm: data.odometerKm ?? null,
    workshopName: data.workshopName ?? null,
    description: data.description ?? data.notes ?? null,
    costCents: data.costCents ?? null,
    ...buildConfirmedFieldSnapshot(ctx),
  };
}

function buildCompliancePayload(
  ctx: DocumentActionPlannerBuildContext,
  semanticAction: MaintenanceSemanticAction,
): Record<string, unknown> {
  const data = ctx.input.confirmedData;
  return {
    semanticAction,
    eventDate: data.eventDate ?? null,
    validUntil: hasNonEmptyField(data, 'validUntil') ? data.validUntil : null,
    reportNumber: data.reportNumber ?? null,
    result: data.result ?? null,
    defects: data.defects ?? null,
    defectStatus: hasConfirmedDefectStatus(ctx.input) ? 'DEFECTS_PRESENT' : 'NO_DEFECTS_CONFIRMED',
    ...buildConfirmedFieldSnapshot(ctx),
  };
}

function buildDamageDraftPayload(ctx: DocumentActionPlannerBuildContext): Record<string, unknown> {
  const data = ctx.input.confirmedData;
  return {
    semanticAction: MAINTENANCE_SEMANTIC_ACTIONS.CREATE_DAMAGE_DRAFT,
    description: data.description ?? null,
    eventDate: data.eventDate ?? null,
    damageArea: data.damageArea ?? null,
    severity: hasNonEmptyField(data, 'severity') ? data.severity : null,
    damageType: hasNonEmptyField(data, 'damageType') ? data.damageType : null,
    estimatedCostGross: data.estimatedCostGross ?? null,
    note: 'Damage type and severity are never invented by the planner.',
    ...buildConfirmedFieldSnapshot(ctx),
  };
}

function buildInspectionDraftPayload(ctx: DocumentActionPlannerBuildContext): Record<string, unknown> {
  const data = ctx.input.confirmedData;
  return {
    semanticAction: MAINTENANCE_SEMANTIC_ACTIONS.CREATE_INSPECTION_DRAFT,
    eventDate: data.eventDate ?? null,
    odometerKm: data.odometerKm ?? null,
    description: data.description ?? null,
    ...buildConfirmedFieldSnapshot(ctx),
  };
}

function buildMaintenanceAction(
  actionType: PlannedDocumentActionInput['actionType'],
  semanticAction: MaintenanceSemanticAction,
  ctx: DocumentActionPlannerBuildContext,
  sequence: number,
  payload: Record<string, unknown>,
  previewExtra: Record<string, unknown> = {},
): PlannedDocumentActionInput {
  return {
    actionType,
    requirement: 'REQUIRED',
    targetEntityType: 'VEHICLE',
    targetEntityId: ctx.vehicleEntityId,
    sequence,
    inputPayload: payload,
    previewPayload: {
      semanticAction,
      ...previewExtra,
      ...payload,
    },
  };
}

function buildLinkSuggestionAction(
  entityType: DocumentEntityType,
  candidate: { entityId: string; confidence: number | null },
  sequence: number,
): PlannedDocumentActionInput {
  const semanticAction = SEMANTIC_LINK_BY_ENTITY[entityType];
  return {
    actionType: 'SUGGEST_TASK',
    requirement: 'OPTIONAL',
    targetEntityType: entityType,
    targetEntityId: null,
    sequence,
    inputPayload: {
      semanticAction,
      requiresConfirmation: true,
      candidateEntityId: candidate.entityId,
      candidateConfidence: candidate.confidence,
    },
    previewPayload: {
      semanticAction,
      wouldLink: entityType,
      requiresConfirmation: true,
      candidateEntityId: candidate.entityId,
    },
  };
}

function buildSuggestionAction(
  semanticAction: MaintenanceSemanticAction,
  sequence: number,
  payload: Record<string, unknown>,
): PlannedDocumentActionInput {
  return {
    actionType: 'SUGGEST_TASK',
    requirement: 'OPTIONAL',
    sequence,
    inputPayload: {
      semanticAction,
      ...payload,
    },
    previewPayload: {
      semanticAction,
      wouldSuggest: semanticAction,
      ...payload,
    },
  };
}

function appendDefectSuggestions(
  ctx: DocumentActionPlannerBuildContext,
  actions: PlannedDocumentActionInput[],
  sequence: number,
): number {
  if (!hasConfirmedDefectStatus(ctx.input)) {
    return sequence;
  }

  sequence += 1;
  actions.push(
    buildSuggestionAction(MAINTENANCE_SEMANTIC_ACTIONS.SUGGEST_REPAIR_TASK, sequence, {
      reason: 'inspection_defects_confirmed',
    }),
  );
  sequence += 1;
  actions.push(
    buildSuggestionAction(MAINTENANCE_SEMANTIC_ACTIONS.SUGGEST_VEHICLE_INSPECTION, sequence, {
      reason: 'inspection_defects_confirmed',
    }),
  );
  return sequence;
}

export function buildMaintenancePlannerActions(
  ctx: DocumentActionPlannerBuildContext,
): PlannedDocumentActionInput[] {
  const routingType = ctx.routingType;
  const assessment = assessMaintenanceDraftRequirements(ctx.input);
  const actions: PlannedDocumentActionInput[] = [];
  let sequence = 0;

  if (!routingType || !MAINTENANCE_DOCUMENT_TYPES.has(routingType)) {
    return actions;
  }

  if (assessment.canCreateServiceEvent) {
    sequence += 1;
    actions.push(
      buildMaintenanceAction(
        'CREATE_SERVICE_EVENT',
        MAINTENANCE_SEMANTIC_ACTIONS.CREATE_SERVICE_EVENT,
        ctx,
        sequence,
        buildServiceEventPayload(ctx),
        { wouldCreate: 'vehicle_service_event' },
      ),
    );
  }

  if (assessment.canUpdateTuvCompliance) {
    sequence += 1;
    actions.push(
      buildMaintenanceAction(
        'UPDATE_VEHICLE_INSPECTION',
        MAINTENANCE_SEMANTIC_ACTIONS.UPDATE_TUV_COMPLIANCE,
        ctx,
        sequence,
        buildCompliancePayload(ctx, MAINTENANCE_SEMANTIC_ACTIONS.UPDATE_TUV_COMPLIANCE),
        { wouldUpdate: 'vehicle_tuv_compliance' },
      ),
    );
  }

  if (assessment.canUpdateBokraftCompliance) {
    sequence += 1;
    actions.push(
      buildMaintenanceAction(
        'UPDATE_VEHICLE_INSPECTION',
        MAINTENANCE_SEMANTIC_ACTIONS.UPDATE_BOKRAFT_COMPLIANCE,
        ctx,
        sequence,
        buildCompliancePayload(ctx, MAINTENANCE_SEMANTIC_ACTIONS.UPDATE_BOKRAFT_COMPLIANCE),
        { wouldUpdate: 'vehicle_bokraft_compliance' },
      ),
    );
  }

  if (assessment.canCreateDamageDraft) {
    sequence += 1;
    actions.push(
      buildMaintenanceAction(
        'CREATE_DAMAGE',
        MAINTENANCE_SEMANTIC_ACTIONS.CREATE_DAMAGE_DRAFT,
        ctx,
        sequence,
        buildDamageDraftPayload(ctx),
        { wouldCreate: 'damage_draft' },
      ),
    );
  }

  if (assessment.canCreateInspectionDraft) {
    sequence += 1;
    actions.push(
      buildMaintenanceAction(
        'CREATE_SERVICE_EVENT',
        MAINTENANCE_SEMANTIC_ACTIONS.CREATE_INSPECTION_DRAFT,
        ctx,
        sequence,
        buildInspectionDraftPayload(ctx),
        { wouldCreate: 'vehicle_condition_inspection_draft' },
      ),
    );
  }

  if (routingType === 'ACCIDENT' && assessment.isReady) {
    sequence += 1;
    actions.push(
      buildSuggestionAction(MAINTENANCE_SEMANTIC_ACTIONS.SUGGEST_INSURANCE_REVIEW, sequence, {
        reason: 'accident_requires_insurance_review',
        note: 'Accident documents do not auto-create confirmed damage records.',
      }),
    );
    sequence += 1;
    actions.push(
      buildSuggestionAction(MAINTENANCE_SEMANTIC_ACTIONS.SUGGEST_REPAIR_TASK, sequence, {
        reason: 'accident_follow_up',
      }),
    );
  }

  if (routingType === 'DAMAGE' && assessment.canCreateDamageDraft) {
    sequence += 1;
    actions.push(
      buildSuggestionAction(MAINTENANCE_SEMANTIC_ACTIONS.SUGGEST_REPAIR_TASK, sequence, {
        reason: 'damage_follow_up',
      }),
    );
  }

  sequence = appendDefectSuggestions(ctx, actions, sequence);

  for (const entityType of LINK_ENTITY_TYPES) {
    const candidate = findUnconfirmedLinkCandidate(ctx.input, entityType);
    if (!candidate) continue;
    sequence += 1;
    actions.push(buildLinkSuggestionAction(entityType, candidate, sequence));
  }

  return actions;
}

export function resolveMaintenanceFollowUpCandidateTypes(
  routingType: DocumentExtractionType | null,
  input: Pick<DocumentActionPlannerInput, 'confirmedData' | 'documentSubtype'>,
  isBlocked: boolean,
): DocumentFollowUpCandidateType[] {
  const followUps: DocumentFollowUpCandidateType[] = [];

  if (!routingType) {
    return isBlocked ? ['MANUAL_REVIEW'] : [];
  }

  if (routingType === 'TUV_REPORT' || routingType === 'BOKRAFT_REPORT') {
    followUps.push('SCHEDULE_INSPECTION');
  }
  if (routingType === 'SERVICE' || routingType === 'DAMAGE' || routingType === 'ACCIDENT') {
    followUps.push('CREATE_TASK');
  }
  if (hasConfirmedDefectStatus(input)) {
    followUps.push('SCHEDULE_INSPECTION', 'CREATE_TASK');
  }
  if (isBlocked) {
    followUps.push('MANUAL_REVIEW');
  }

  return [...new Set(followUps)].sort();
}

export function buildMaintenancePlannerSummary(
  routingType: DocumentExtractionType | null,
  isReady: boolean,
  actionCount: number,
): string {
  if (!routingType) {
    return 'Maintenance plan blocked: routing type missing.';
  }
  if (!isReady) {
    return `Maintenance plan blocked for ${routingType}: missing required fields or vehicle link.`;
  }
  if (routingType === 'ACCIDENT') {
    return `Accident plan: ${actionCount} action(s); no automatic damage draft.`;
  }
  return `Maintenance plan for ${routingType}: ${actionCount} action(s).`;
}

export function extractMaintenanceSemanticAction(
  payload: Record<string, unknown> | null | undefined,
): MaintenanceSemanticAction | null {
  const value = payload?.semanticAction;
  if (typeof value !== 'string') return null;
  return Object.values(MAINTENANCE_SEMANTIC_ACTIONS).includes(value as MaintenanceSemanticAction)
    ? (value as MaintenanceSemanticAction)
    : null;
}

export function stripMaintenanceExecutableActions(
  actions: PlannedDocumentActionInput[],
): PlannedDocumentActionInput[] {
  return actions.filter((action) => action.requirement !== 'REQUIRED');
}
