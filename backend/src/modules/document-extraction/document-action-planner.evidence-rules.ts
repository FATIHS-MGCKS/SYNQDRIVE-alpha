import type { DocumentEntityType, DocumentExtractionType } from '@prisma/client';
import type { PlannedDocumentActionInput } from './document-action.types';
import type {
  DocumentActionBlockingReason,
  DocumentActionMissingRequirement,
  DocumentActionPlannerBuildContext,
  DocumentActionPlannerInput,
  DocumentFollowUpCandidateType,
} from './document-action-planner.types';

export const EVIDENCE_SEMANTIC_ACTIONS = {
  CREATE_TIRE_MEASUREMENT: 'CREATE_TIRE_MEASUREMENT',
  CREATE_BRAKE_EVIDENCE: 'CREATE_BRAKE_EVIDENCE',
  CREATE_BATTERY_EVIDENCE: 'CREATE_BATTERY_EVIDENCE',
  CREATE_SERVICE_EVENT: 'CREATE_SERVICE_EVENT',
  LINK_VEHICLE: 'LINK_VEHICLE',
  SUGGEST_WORKSHOP_TASK: 'SUGGEST_WORKSHOP_TASK',
  SUGGEST_REMEASUREMENT: 'SUGGEST_REMEASUREMENT',
} as const;

export type EvidenceSemanticAction =
  (typeof EVIDENCE_SEMANTIC_ACTIONS)[keyof typeof EVIDENCE_SEMANTIC_ACTIONS];

export const EVIDENCE_DOCUMENT_TYPES = new Set<DocumentExtractionType>([
  'TIRE',
  'BRAKE',
  'BATTERY',
]);

export const EVIDENCE_DOCUMENT_MODES = {
  TIRE: 'TIRE',
  BRAKE: 'BRAKE',
  BATTERY: 'BATTERY',
  WORKSHOP_MEASUREMENT: 'WORKSHOP_MEASUREMENT',
} as const;

export type EvidenceDocumentMode =
  (typeof EVIDENCE_DOCUMENT_MODES)[keyof typeof EVIDENCE_DOCUMENT_MODES];

export const EVIDENCE_PLAN_OUTCOMES = {
  READY: 'READY',
  REQUIRES_REMEASUREMENT: 'REQUIRES_REMEASUREMENT',
  BLOCKED: 'BLOCKED',
} as const;

export type EvidencePlanOutcome =
  (typeof EVIDENCE_PLAN_OUTCOMES)[keyof typeof EVIDENCE_PLAN_OUTCOMES];

const WORKSHOP_MEASUREMENT_SUBTYPES = new Set([
  'WORKSHOP_REPORT',
  'TECHNICAL_MEASUREMENT',
  'MEASUREMENT_REPORT',
  'WORKSHOP_MEASUREMENT',
  'TECHNICAL_REPORT',
]);

const TREAD_MIN_MM = 0;
const TREAD_MAX_MM = 20;
const TREAD_IMPLAUSIBLE_HIGH_MM = 14;
const BRAKE_PAD_MM_MAX = 25;
const BRAKE_DISC_MM_MAX = 50;
const LV_VOLTAGE_MIN = 6;
const LV_VOLTAGE_MAX = 16;
const SOH_MIN = 0;
const SOH_MAX = 100;

const LINK_ENTITY_TYPES: DocumentEntityType[] = ['VEHICLE'];

const SEMANTIC_LINK_BY_ENTITY: Record<DocumentEntityType, EvidenceSemanticAction> = {
  VEHICLE: EVIDENCE_SEMANTIC_ACTIONS.LINK_VEHICLE,
  BOOKING: EVIDENCE_SEMANTIC_ACTIONS.LINK_VEHICLE,
  CUSTOMER: EVIDENCE_SEMANTIC_ACTIONS.LINK_VEHICLE,
  DRIVER: EVIDENCE_SEMANTIC_ACTIONS.LINK_VEHICLE,
  VENDOR: EVIDENCE_SEMANTIC_ACTIONS.LINK_VEHICLE,
  ORGANIZATION: EVIDENCE_SEMANTIC_ACTIONS.LINK_VEHICLE,
};

export function normalizeEvidenceDocumentSubtype(
  subtype: string | null | undefined,
): string | null {
  if (!subtype?.trim()) return null;
  return subtype.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function isEvidenceDocumentProfile(
  input: Pick<
    DocumentActionPlannerInput,
    'effectiveDocumentType' | 'documentSubtype' | 'confirmedData'
  >,
): boolean {
  const type = input.effectiveDocumentType;
  if (type && EVIDENCE_DOCUMENT_TYPES.has(type)) {
    return true;
  }

  const normalizedSubtype = normalizeEvidenceDocumentSubtype(input.documentSubtype);
  if (normalizedSubtype && WORKSHOP_MEASUREMENT_SUBTYPES.has(normalizedSubtype)) {
    return type === 'SERVICE' || type === 'OIL_CHANGE';
  }

  const documentKind = normalizeEvidenceDocumentSubtype(
    String(input.confirmedData.documentKind ?? ''),
  );
  if (documentKind && WORKSHOP_MEASUREMENT_SUBTYPES.has(documentKind)) {
    return type === 'SERVICE' || type === 'OIL_CHANGE';
  }

  return false;
}

export function resolveEvidenceDocumentMode(
  input: Pick<DocumentActionPlannerInput, 'effectiveDocumentType' | 'documentSubtype' | 'confirmedData'>,
): EvidenceDocumentMode {
  const normalizedSubtype = normalizeEvidenceDocumentSubtype(input.documentSubtype);
  const documentKind = normalizeEvidenceDocumentSubtype(
    String(input.confirmedData.documentKind ?? ''),
  );
  if (
    (normalizedSubtype && WORKSHOP_MEASUREMENT_SUBTYPES.has(normalizedSubtype)) ||
    (documentKind && WORKSHOP_MEASUREMENT_SUBTYPES.has(documentKind))
  ) {
    return EVIDENCE_DOCUMENT_MODES.WORKSHOP_MEASUREMENT;
  }

  switch (input.effectiveDocumentType) {
    case 'TIRE':
      return EVIDENCE_DOCUMENT_MODES.TIRE;
    case 'BRAKE':
      return EVIDENCE_DOCUMENT_MODES.BRAKE;
    case 'BATTERY':
      return EVIDENCE_DOCUMENT_MODES.BATTERY;
    default:
      return EVIDENCE_DOCUMENT_MODES.WORKSHOP_MEASUREMENT;
  }
}

function hasNonEmptyField(data: Record<string, unknown>, key: string): boolean {
  const value = data[key];
  return value != null && value !== '';
}

function readNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function hasAnyTreadDepth(data: Record<string, unknown>): boolean {
  const tread = data.treadDepthMm;
  if (tread == null || typeof tread !== 'object') return false;
  const record = tread as Record<string, unknown>;
  return ['fl', 'fr', 'rl', 'rr'].some((wheel) => readNumber(record[wheel]) != null);
}

function hasAnyBrakeMeasurement(data: Record<string, unknown>): boolean {
  return (
    readNumber(data.frontPadMm) != null ||
    readNumber(data.rearPadMm) != null ||
    readNumber(data.frontDiscMm) != null ||
    readNumber(data.rearDiscMm) != null
  );
}

function hasAnyBatteryMeasurement(data: Record<string, unknown>): boolean {
  return (
    readNumber(data.voltageV) != null ||
    readNumber(data.restingVoltage) != null ||
    readNumber(data.sohPercent) != null
  );
}

export type MeasurementValidationIssue = {
  code: string;
  message: string;
  fieldKeys: string[];
  severity: 'BLOCKER' | 'WARNING';
};

export function validateTireMeasurements(
  data: Record<string, unknown>,
): MeasurementValidationIssue[] {
  const issues: MeasurementValidationIssue[] = [];
  const tread = (data.treadDepthMm as Record<string, unknown>) ?? {};

  for (const pos of ['fl', 'fr', 'rl', 'rr']) {
    const value = readNumber(tread[pos]);
    if (value == null) continue;
    if (value < TREAD_MIN_MM) {
      issues.push({
        code: `TREAD_NEGATIVE_${pos.toUpperCase()}`,
        message: `Tread depth (${pos.toUpperCase()}) must be >= ${TREAD_MIN_MM} mm.`,
        fieldKeys: [`treadDepthMm.${pos}`],
        severity: 'BLOCKER',
      });
    } else if (value > TREAD_MAX_MM) {
      issues.push({
        code: `TREAD_OUT_OF_RANGE_${pos.toUpperCase()}`,
        message: `Tread depth (${pos.toUpperCase()}) exceeds plausible ${TREAD_MAX_MM} mm.`,
        fieldKeys: [`treadDepthMm.${pos}`],
        severity: 'BLOCKER',
      });
    } else if (value > TREAD_IMPLAUSIBLE_HIGH_MM) {
      issues.push({
        code: `TREAD_IMPLAUSIBLE_${pos.toUpperCase()}`,
        message: `Tread depth ${pos.toUpperCase()} (${value} mm) is implausibly high.`,
        fieldKeys: [`treadDepthMm.${pos}`],
        severity: 'WARNING',
      });
    }
  }

  return issues;
}

export function validateBrakeMeasurements(
  data: Record<string, unknown>,
): MeasurementValidationIssue[] {
  const issues: MeasurementValidationIssue[] = [];
  const fields: Array<{ key: string; max: number }> = [
    { key: 'frontPadMm', max: BRAKE_PAD_MM_MAX },
    { key: 'rearPadMm', max: BRAKE_PAD_MM_MAX },
    { key: 'frontDiscMm', max: BRAKE_DISC_MM_MAX },
    { key: 'rearDiscMm', max: BRAKE_DISC_MM_MAX },
  ];

  for (const field of fields) {
    const value = readNumber(data[field.key]);
    if (value == null) continue;
    if (value < 0) {
      issues.push({
        code: `BRAKE_NEGATIVE_${field.key.toUpperCase()}`,
        message: `${field.key} must not be negative.`,
        fieldKeys: [field.key],
        severity: 'BLOCKER',
      });
    } else if (value > field.max) {
      issues.push({
        code: `BRAKE_OUT_OF_RANGE_${field.key.toUpperCase()}`,
        message: `${field.key} (${value} mm) exceeds plausible ${field.max} mm.`,
        fieldKeys: [field.key],
        severity: 'BLOCKER',
      });
    }
  }

  return issues;
}

export function validateBatteryMeasurements(
  data: Record<string, unknown>,
): MeasurementValidationIssue[] {
  const issues: MeasurementValidationIssue[] = [];
  const scope = String(data.scope ?? '').toLowerCase();
  const voltage = readNumber(data.voltageV) ?? readNumber(data.restingVoltage);
  const soh = readNumber(data.sohPercent);

  if (scope === 'lv' && voltage != null && (voltage < LV_VOLTAGE_MIN || voltage > LV_VOLTAGE_MAX)) {
    issues.push({
      code: 'LV_VOLTAGE_RANGE',
      message: `LV battery voltage (${voltage} V) is outside ${LV_VOLTAGE_MIN}–${LV_VOLTAGE_MAX} V.`,
      fieldKeys: ['voltageV'],
      severity: 'WARNING',
    });
  }

  if (soh != null && (soh < SOH_MIN || soh > SOH_MAX)) {
    issues.push({
      code: 'SOH_RANGE',
      message: `State of health (${soh}%) is outside ${SOH_MIN}–${SOH_MAX}%.`,
      fieldKeys: ['sohPercent'],
      severity: 'BLOCKER',
    });
  }

  return issues;
}

export function collectEvidenceMeasurementIssues(
  mode: EvidenceDocumentMode,
  data: Record<string, unknown>,
): MeasurementValidationIssue[] {
  switch (mode) {
    case EVIDENCE_DOCUMENT_MODES.TIRE:
      return validateTireMeasurements(data);
    case EVIDENCE_DOCUMENT_MODES.BRAKE:
      return validateBrakeMeasurements(data);
    case EVIDENCE_DOCUMENT_MODES.BATTERY:
      return validateBatteryMeasurements(data);
    case EVIDENCE_DOCUMENT_MODES.WORKSHOP_MEASUREMENT:
      return [
        ...validateTireMeasurements(data),
        ...validateBrakeMeasurements(data),
        ...validateBatteryMeasurements(data),
      ];
    default:
      return [];
  }
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

export type EvidenceDraftRequirementAssessment = {
  missingRequirements: DocumentActionMissingRequirement[];
  measurementIssues: MeasurementValidationIssue[];
  canCreateTireMeasurement: boolean;
  canCreateBrakeEvidence: boolean;
  canCreateBatteryEvidence: boolean;
  canCreateServiceEvent: boolean;
  planOutcome: EvidencePlanOutcome;
};

function buildProvenancePayload(
  mode: EvidenceDocumentMode,
): Record<string, unknown> {
  return {
    provenance: 'CONFIRMED_DOCUMENT',
    extractionProvenance: 'DOCUMENT_INTAKE_CONFIRMED',
    workshopFindingProvenance: mode === EVIDENCE_DOCUMENT_MODES.WORKSHOP_MEASUREMENT,
    noHealthScoreOverwrite: true,
    supplementalEvidenceOnly: true,
    note: 'Evidence is supplemental; canonical health domains are not overwritten by the planner.',
  };
}

export function assessEvidenceDraftRequirements(
  input: DocumentActionPlannerInput,
): EvidenceDraftRequirementAssessment {
  const mode = resolveEvidenceDocumentMode(input);
  const data = input.confirmedData;
  const missingRequirements: DocumentActionMissingRequirement[] = [];
  const missingFieldKeys: string[] = [];
  const measurementIssues = collectEvidenceMeasurementIssues(mode, data);

  if (!hasConfirmedEntityLink(input.entityLinks, 'VEHICLE')) {
    missingRequirements.push({
      code: 'MISSING_CONFIRMED_VEHICLE_LINK',
      message: 'A confirmed VEHICLE entity link is required before evidence can be created.',
      entityType: 'VEHICLE',
    });
  }

  if (mode === EVIDENCE_DOCUMENT_MODES.TIRE && !hasAnyTreadDepth(data)) {
    missingFieldKeys.push('treadDepthMm');
  }
  if (mode === EVIDENCE_DOCUMENT_MODES.BRAKE) {
    if (!hasNonEmptyField(data, 'eventDate')) missingFieldKeys.push('eventDate');
    if (!hasAnyBrakeMeasurement(data)) {
      missingFieldKeys.push('frontPadMm');
    }
  }
  if (mode === EVIDENCE_DOCUMENT_MODES.BATTERY) {
    if (!hasNonEmptyField(data, 'eventDate')) missingFieldKeys.push('eventDate');
    if (!hasNonEmptyField(data, 'scope')) missingFieldKeys.push('scope');
    if (!hasAnyBatteryMeasurement(data)) {
      missingFieldKeys.push('voltageV');
    }
  }
  if (mode === EVIDENCE_DOCUMENT_MODES.WORKSHOP_MEASUREMENT) {
    if (!hasNonEmptyField(data, 'eventDate')) missingFieldKeys.push('eventDate');
    if (
      !hasAnyTreadDepth(data) &&
      !hasAnyBrakeMeasurement(data) &&
      !hasAnyBatteryMeasurement(data) &&
      !hasNonEmptyField(data, 'description')
    ) {
      missingFieldKeys.push('description');
    }
  }

  if (missingFieldKeys.length > 0) {
    missingRequirements.push({
      code: 'MISSING_EVIDENCE_FIELDS',
      message: `Missing required confirmed evidence fields: ${missingFieldKeys.join(', ')}`,
      fieldKeys: missingFieldKeys,
    });
  }

  const hasBlockerIssue = measurementIssues.some((issue) => issue.severity === 'BLOCKER');
  const hasWarningIssue = measurementIssues.some((issue) => issue.severity === 'WARNING');
  const vehicleReady = hasConfirmedEntityLink(input.entityLinks, 'VEHICLE');
  const fieldsReady = missingFieldKeys.length === 0;

  const canCreateTireMeasurement =
    vehicleReady &&
    fieldsReady &&
    !hasBlockerIssue &&
    (mode === EVIDENCE_DOCUMENT_MODES.TIRE ||
      (mode === EVIDENCE_DOCUMENT_MODES.WORKSHOP_MEASUREMENT && hasAnyTreadDepth(data))) &&
    !hasWarningIssue;

  const canCreateBrakeEvidence =
    vehicleReady &&
    fieldsReady &&
    !hasBlockerIssue &&
    (mode === EVIDENCE_DOCUMENT_MODES.BRAKE ||
      (mode === EVIDENCE_DOCUMENT_MODES.WORKSHOP_MEASUREMENT && hasAnyBrakeMeasurement(data)));

  const canCreateBatteryEvidence =
    vehicleReady &&
    fieldsReady &&
    !hasBlockerIssue &&
    !hasWarningIssue &&
    (mode === EVIDENCE_DOCUMENT_MODES.BATTERY ||
      (mode === EVIDENCE_DOCUMENT_MODES.WORKSHOP_MEASUREMENT && hasAnyBatteryMeasurement(data)));

  const canCreateServiceEvent =
    vehicleReady &&
    fieldsReady &&
    mode === EVIDENCE_DOCUMENT_MODES.WORKSHOP_MEASUREMENT &&
    hasNonEmptyField(data, 'eventDate');

  let planOutcome: EvidencePlanOutcome = EVIDENCE_PLAN_OUTCOMES.READY;
  if (missingFieldKeys.length > 0 && missingFieldKeys.includes('treadDepthMm') && mode === EVIDENCE_DOCUMENT_MODES.TIRE) {
    planOutcome = EVIDENCE_PLAN_OUTCOMES.BLOCKED;
  } else if (hasBlockerIssue || missingRequirements.some((m) => m.code === 'MISSING_CONFIRMED_VEHICLE_LINK')) {
    planOutcome = EVIDENCE_PLAN_OUTCOMES.BLOCKED;
  } else if (hasWarningIssue || (fieldsReady && !canCreateTireMeasurement && !canCreateBrakeEvidence && !canCreateBatteryEvidence && mode !== EVIDENCE_DOCUMENT_MODES.WORKSHOP_MEASUREMENT)) {
    planOutcome = EVIDENCE_PLAN_OUTCOMES.REQUIRES_REMEASUREMENT;
  } else if (!fieldsReady) {
    planOutcome = EVIDENCE_PLAN_OUTCOMES.BLOCKED;
  }

  return {
    missingRequirements,
    measurementIssues,
    canCreateTireMeasurement,
    canCreateBrakeEvidence,
    canCreateBatteryEvidence,
    canCreateServiceEvent,
    planOutcome,
  };
}

export function collectEvidenceReadinessBlockers(
  input: DocumentActionPlannerInput,
): DocumentActionBlockingReason[] {
  const blockers: DocumentActionBlockingReason[] = [];
  const decision = input.applySafetyDecision ?? {};

  if (decision.canApply === false) {
    blockers.push({
      code: 'APPLY_SAFETY_BLOCKED',
      message: 'Apply safety decision blocks evidence creation.',
      source: 'REQUIREMENT',
      severity: 'BLOCKER',
    });
  }

  if (decision.readinessPolicyBlocked === true) {
    blockers.push({
      code: 'READINESS_POLICY_BLOCKED',
      message: String(
        decision.readinessPolicyMessage ??
          'Readiness policy blocks confirmed evidence apply actions.',
      ),
      source: 'REQUIREMENT',
      severity: 'BLOCKER',
    });
  }

  if (decision.confirmedActionRequired === true && decision.actionConfirmed !== true) {
    blockers.push({
      code: 'CONFIRMED_ACTION_REQUIRED',
      message: 'Confirmed operator action is required before evidence apply.',
      source: 'REQUIREMENT',
      severity: 'BLOCKER',
    });
  }

  return blockers;
}

function buildEvidencePayload(
  ctx: DocumentActionPlannerBuildContext,
  semanticAction: EvidenceSemanticAction,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const mode = resolveEvidenceDocumentMode(ctx.input);
  return {
    semanticAction,
    ...fields,
    ...buildProvenancePayload(mode),
    confirmedFieldKeys: Object.keys(ctx.input.confirmedData).sort(),
  };
}

function buildEvidenceAction(
  actionType: PlannedDocumentActionInput['actionType'],
  semanticAction: EvidenceSemanticAction,
  ctx: DocumentActionPlannerBuildContext,
  sequence: number,
  fields: Record<string, unknown>,
  previewExtra: Record<string, unknown> = {},
): PlannedDocumentActionInput {
  const payload = buildEvidencePayload(ctx, semanticAction, fields);
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

function buildSuggestionAction(
  semanticAction: EvidenceSemanticAction,
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

export function buildEvidencePlannerActions(
  ctx: DocumentActionPlannerBuildContext,
): PlannedDocumentActionInput[] {
  const assessment = assessEvidenceDraftRequirements(ctx.input);
  const data = ctx.input.confirmedData;
  const actions: PlannedDocumentActionInput[] = [];
  let sequence = 0;

  if (assessment.canCreateServiceEvent) {
    sequence += 1;
    actions.push(
      buildEvidenceAction(
        'CREATE_SERVICE_EVENT',
        EVIDENCE_SEMANTIC_ACTIONS.CREATE_SERVICE_EVENT,
        ctx,
        sequence,
        {
          eventDate: data.eventDate ?? null,
          workshopName: data.workshopName ?? null,
          description: data.description ?? data.notes ?? null,
          odometerKm: readNumber(data.odometerKm),
        },
        { wouldCreate: 'workshop_service_event' },
      ),
    );
  }

  if (assessment.canCreateTireMeasurement) {
    sequence += 1;
    actions.push(
      buildEvidenceAction(
        'RECORD_TIRE_MEASUREMENT',
        EVIDENCE_SEMANTIC_ACTIONS.CREATE_TIRE_MEASUREMENT,
        ctx,
        sequence,
        {
          treadDepthMm: data.treadDepthMm ?? null,
          odometerKm: readNumber(data.odometerKm),
          eventDate: data.eventDate ?? null,
          unit: 'mm',
        },
        { wouldCreate: 'tire_measurement_evidence' },
      ),
    );
  }

  if (assessment.canCreateBrakeEvidence) {
    sequence += 1;
    actions.push(
      buildEvidenceAction(
        'RECORD_BRAKE_EVIDENCE',
        EVIDENCE_SEMANTIC_ACTIONS.CREATE_BRAKE_EVIDENCE,
        ctx,
        sequence,
        {
          eventDate: data.eventDate ?? null,
          serviceKind: data.serviceKind ?? null,
          scopeCsv: data.scopeCsv ?? null,
          frontPadMm: readNumber(data.frontPadMm),
          rearPadMm: readNumber(data.rearPadMm),
          frontDiscMm: readNumber(data.frontDiscMm),
          rearDiscMm: readNumber(data.rearDiscMm),
          unit: 'mm',
        },
        { wouldCreate: 'brake_evidence' },
      ),
    );
  }

  if (assessment.canCreateBatteryEvidence) {
    sequence += 1;
    actions.push(
      buildEvidenceAction(
        'RECORD_BATTERY_EVIDENCE',
        EVIDENCE_SEMANTIC_ACTIONS.CREATE_BATTERY_EVIDENCE,
        ctx,
        sequence,
        {
          eventDate: data.eventDate ?? null,
          scope: data.scope ?? null,
          voltageV: readNumber(data.voltageV) ?? readNumber(data.restingVoltage),
          sohPercent: readNumber(data.sohPercent),
          recordKind: data.recordKind ?? null,
          unitVoltage: 'V',
          unitSoh: 'percent',
        },
        { wouldCreate: 'battery_evidence' },
      ),
    );
  }

  if (assessment.planOutcome === EVIDENCE_PLAN_OUTCOMES.REQUIRES_REMEASUREMENT) {
    sequence += 1;
    actions.push(
      buildSuggestionAction(EVIDENCE_SEMANTIC_ACTIONS.SUGGEST_REMEASUREMENT, sequence, {
        reason: 'implausible_or_uncertain_measurement',
        measurementIssueCodes: assessment.measurementIssues.map((issue) => issue.code),
      }),
    );
  }

  if (
    assessment.planOutcome === EVIDENCE_PLAN_OUTCOMES.BLOCKED ||
    assessment.planOutcome === EVIDENCE_PLAN_OUTCOMES.REQUIRES_REMEASUREMENT
  ) {
    sequence += 1;
    actions.push(
      buildSuggestionAction(EVIDENCE_SEMANTIC_ACTIONS.SUGGEST_WORKSHOP_TASK, sequence, {
        reason: 'evidence_requires_workshop_follow_up',
      }),
    );
  }

  for (const entityType of LINK_ENTITY_TYPES) {
    const candidate = findUnconfirmedLinkCandidate(ctx.input, entityType);
    if (!candidate) continue;
    sequence += 1;
    actions.push(buildLinkSuggestionAction(entityType, candidate, sequence));
  }

  return actions;
}

export function resolveEvidenceFollowUpCandidateTypes(
  planOutcome: EvidencePlanOutcome,
  isBlocked: boolean,
): DocumentFollowUpCandidateType[] {
  const followUps: DocumentFollowUpCandidateType[] = [];
  if (planOutcome === EVIDENCE_PLAN_OUTCOMES.REQUIRES_REMEASUREMENT) {
    followUps.push('CREATE_TASK', 'MANUAL_REVIEW');
  }
  if (isBlocked) {
    followUps.push('MANUAL_REVIEW');
  }
  return [...new Set(followUps)].sort();
}

export function buildEvidencePlannerSummary(
  mode: EvidenceDocumentMode,
  planOutcome: EvidencePlanOutcome,
  actionCount: number,
): string {
  if (planOutcome === EVIDENCE_PLAN_OUTCOMES.BLOCKED) {
    return `Evidence plan blocked for ${mode}: missing fields, invalid units, or readiness policy.`;
  }
  if (planOutcome === EVIDENCE_PLAN_OUTCOMES.REQUIRES_REMEASUREMENT) {
    return `Evidence plan for ${mode}: remeasurement suggested; ${actionCount} action(s).`;
  }
  return `Evidence plan for ${mode}: ${actionCount} action(s); supplemental evidence only.`;
}

export function extractEvidenceSemanticAction(
  payload: Record<string, unknown> | null | undefined,
): EvidenceSemanticAction | null {
  const value = payload?.semanticAction;
  if (typeof value !== 'string') return null;
  return Object.values(EVIDENCE_SEMANTIC_ACTIONS).includes(value as EvidenceSemanticAction)
    ? (value as EvidenceSemanticAction)
    : null;
}

export function stripEvidenceExecutableActions(
  actions: PlannedDocumentActionInput[],
): PlannedDocumentActionInput[] {
  return actions.filter((action) => action.requirement !== 'REQUIRED');
}
