import type { DocumentEntityType } from '@prisma/client';
import type { PlannedDocumentActionInput } from './document-action.types';
import type {
  DocumentActionBlockingReason,
  DocumentActionMissingRequirement,
  DocumentActionPlannerBuildContext,
  DocumentActionPlannerInput,
  DocumentFollowUpCandidateType,
} from './document-action-planner.types';

export const FINE_SEMANTIC_ACTIONS = {
  CREATE_FINE_DRAFT: 'CREATE_FINE_DRAFT',
  LINK_VEHICLE: 'LINK_VEHICLE',
  LINK_BOOKING: 'LINK_BOOKING',
  LINK_CUSTOMER: 'LINK_CUSTOMER',
  LINK_DRIVER: 'LINK_DRIVER',
  SUGGEST_DRIVER_REVIEW: 'SUGGEST_DRIVER_REVIEW',
  SUGGEST_DEADLINE_TASK: 'SUGGEST_DEADLINE_TASK',
  SUGGEST_CUSTOMER_CONTACT: 'SUGGEST_CUSTOMER_CONTACT',
} as const;

export type FineSemanticAction =
  (typeof FINE_SEMANTIC_ACTIONS)[keyof typeof FINE_SEMANTIC_ACTIONS];

export const FINE_DOCUMENT_MODES = {
  FINE_NOTICE: 'FINE_NOTICE',
  HEARING_FORM: 'HEARING_FORM',
  DRIVER_INQUIRY: 'DRIVER_INQUIRY',
} as const;

export type FineDocumentMode = (typeof FINE_DOCUMENT_MODES)[keyof typeof FINE_DOCUMENT_MODES];

const HEARING_FORM_SUBTYPES = new Set([
  'HEARING_FORM',
  'ANHOERUNGSBOGEN',
  'ANHORUNGSBOGEN',
  'HEARING_NOTICE',
]);

const DRIVER_INQUIRY_SUBTYPES = new Set([
  'DRIVER_INQUIRY',
  'FAHRERERMITTLUNG',
  'DRIVER_IDENTIFICATION',
]);

const ATTRIBUTION_ENTITY_TYPES: DocumentEntityType[] = ['BOOKING', 'DRIVER'];

const LINK_ENTITY_TYPES: DocumentEntityType[] = ['VEHICLE', 'BOOKING', 'CUSTOMER', 'DRIVER'];

const SEMANTIC_LINK_BY_ENTITY: Record<DocumentEntityType, FineSemanticAction> = {
  VEHICLE: FINE_SEMANTIC_ACTIONS.LINK_VEHICLE,
  BOOKING: FINE_SEMANTIC_ACTIONS.LINK_BOOKING,
  CUSTOMER: FINE_SEMANTIC_ACTIONS.LINK_CUSTOMER,
  DRIVER: FINE_SEMANTIC_ACTIONS.LINK_DRIVER,
  VENDOR: FINE_SEMANTIC_ACTIONS.LINK_CUSTOMER,
  ORGANIZATION: FINE_SEMANTIC_ACTIONS.LINK_CUSTOMER,
};

export function normalizeFineDocumentSubtype(
  subtype: string | null | undefined,
): string | null {
  if (!subtype?.trim()) return null;
  return subtype.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function isFineDocumentProfile(
  input: Pick<DocumentActionPlannerInput, 'effectiveDocumentType'>,
): boolean {
  return input.effectiveDocumentType === 'FINE';
}

export function resolveFineDocumentMode(
  input: Pick<DocumentActionPlannerInput, 'documentSubtype' | 'confirmedData'>,
): FineDocumentMode {
  const normalized = normalizeFineDocumentSubtype(input.documentSubtype);
  if (normalized && HEARING_FORM_SUBTYPES.has(normalized)) {
    return FINE_DOCUMENT_MODES.HEARING_FORM;
  }
  if (normalized && DRIVER_INQUIRY_SUBTYPES.has(normalized)) {
    return FINE_DOCUMENT_MODES.DRIVER_INQUIRY;
  }

  const documentKind = String(input.confirmedData.documentKind ?? '').toUpperCase();
  if (HEARING_FORM_SUBTYPES.has(documentKind)) {
    return FINE_DOCUMENT_MODES.HEARING_FORM;
  }
  if (DRIVER_INQUIRY_SUBTYPES.has(documentKind)) {
    return FINE_DOCUMENT_MODES.DRIVER_INQUIRY;
  }

  return FINE_DOCUMENT_MODES.FINE_NOTICE;
}

function hasNonEmptyField(data: Record<string, unknown>, key: string): boolean {
  const value = data[key];
  return value != null && value !== '';
}

function readPositiveCents(data: Record<string, unknown>): number | null {
  const raw = data.totalCents;
  if (raw == null || raw === '') return null;
  const cents = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return cents;
}

function hasReferenceNumber(data: Record<string, unknown>): boolean {
  return (
    hasNonEmptyField(data, 'reportNumber') ||
    hasNonEmptyField(data, 'referenceNumber') ||
    hasNonEmptyField(data, 'caseNumber') ||
    hasNonEmptyField(data, 'fileNumber')
  );
}

export function hasOffenseDate(data: Record<string, unknown>): boolean {
  return hasNonEmptyField(data, 'eventDate') || hasNonEmptyField(data, 'eventDateTime');
}

export function hasOffenseTime(data: Record<string, unknown>): boolean {
  if (hasNonEmptyField(data, 'eventTime')) return true;
  const eventDateTime = data.eventDateTime;
  if (typeof eventDateTime === 'string' && eventDateTime.includes('T')) {
    const timePart = eventDateTime.split('T')[1] ?? '';
    return Boolean(timePart && !/^00:00(?::00)?/.test(timePart));
  }
  const eventDate = data.eventDate;
  if (typeof eventDate === 'string' && eventDate.includes('T')) {
    const timePart = eventDate.split('T')[1] ?? '';
    return Boolean(timePart && !/^00:00(?::00)?/.test(timePart));
  }
  return false;
}

function hasConfirmedEntityLink(
  entityLinks: DocumentActionPlannerInput['entityLinks'],
  entityType: DocumentEntityType,
): boolean {
  return entityLinks.some(
    (link) => String(link.entityType).toUpperCase() === entityType && link.entityId?.trim(),
  );
}

function listActiveDriverCandidates(input: DocumentActionPlannerInput): Array<{
  entityId: string;
  confidence: number | null;
}> {
  return input.entityCandidates
    .filter(
      (candidate) =>
        String(candidate.entityType).toUpperCase() === 'DRIVER' &&
        candidate.entityId?.trim() &&
        String(candidate.status ?? 'PROPOSED').toUpperCase() !== 'REJECTED',
    )
    .map((candidate) => ({
      entityId: candidate.entityId!.trim(),
      confidence: candidate.confidence ?? null,
    }));
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

export type FineDraftRequirementAssessment = {
  missingRequirements: DocumentActionMissingRequirement[];
  canCreateFineDraft: boolean;
};

export function assessFineDraftRequirements(
  input: DocumentActionPlannerInput,
): FineDraftRequirementAssessment {
  const data = input.confirmedData;
  const missingRequirements: DocumentActionMissingRequirement[] = [];
  const missingFieldKeys: string[] = [];

  if (!hasOffenseDate(data)) missingFieldKeys.push('eventDate');
  if (readPositiveCents(data) == null) missingFieldKeys.push('totalCents');
  if (!hasNonEmptyField(data, 'issuingAuthority')) missingFieldKeys.push('issuingAuthority');
  if (!hasReferenceNumber(data)) {
    missingFieldKeys.push('reportNumber');
  }
  if (!hasConfirmedEntityLink(input.entityLinks, 'VEHICLE')) {
    missingRequirements.push({
      code: 'MISSING_CONFIRMED_VEHICLE_LINK',
      message: 'A confirmed VEHICLE entity link is required before creating a fine draft.',
      entityType: 'VEHICLE',
    });
  }

  if (missingFieldKeys.length > 0) {
    missingRequirements.push({
      code: 'MISSING_FINE_DRAFT_FIELDS',
      message: `Missing required fine draft fields: ${missingFieldKeys.join(', ')}`,
      fieldKeys: missingFieldKeys,
    });
  }

  if (data.totalCents != null && readPositiveCents(data) == null) {
    missingRequirements.push({
      code: 'FINE_AMOUNT_NON_POSITIVE',
      message: 'Fine amount must be greater than zero cents.',
      fieldKeys: ['totalCents'],
    });
  }

  return {
    missingRequirements,
    canCreateFineDraft:
      missingRequirements.length === 0 &&
      resolveFineDocumentMode(input) === FINE_DOCUMENT_MODES.FINE_NOTICE,
  };
}

export function collectFineAttributionBlockers(
  input: DocumentActionPlannerInput,
): DocumentActionBlockingReason[] {
  const blockers: DocumentActionBlockingReason[] = [];

  if (!hasOffenseTime(input.confirmedData)) {
    blockers.push({
      code: 'MISSING_OFFENSE_TIME',
      message: 'Offense time is required before booking or driver attribution can be suggested.',
      source: 'REQUIREMENT',
      severity: 'BLOCKER',
    });
  }

  const driverCandidates = listActiveDriverCandidates(input);
  if (driverCandidates.length > 1) {
    blockers.push({
      code: 'MULTIPLE_DRIVER_CANDIDATES',
      message: 'Multiple driver candidates found — no automatic driver assignment.',
      source: 'ENTITY',
      severity: 'BLOCKER',
    });
  }

  return blockers;
}

function buildFineDraftPayload(ctx: DocumentActionPlannerBuildContext): Record<string, unknown> {
  const data = ctx.input.confirmedData;
  return {
    semanticAction: FINE_SEMANTIC_ACTIONS.CREATE_FINE_DRAFT,
    eventDate: data.eventDate ?? data.eventDateTime ?? null,
    eventTime: data.eventTime ?? null,
    totalCents: readPositiveCents(data),
    issuingAuthority: data.issuingAuthority ?? null,
    reportNumber: data.reportNumber ?? data.referenceNumber ?? data.caseNumber ?? null,
    offenseType: data.offenseType ?? null,
    dueDate: data.dueDate ?? null,
    location: data.location ?? null,
    confirmedFieldKeys: Object.keys(data).sort(),
    note: 'No default offense type is applied by the planner.',
  };
}

function buildFineDraftAction(
  ctx: DocumentActionPlannerBuildContext,
  sequence: number,
  requirement: PlannedDocumentActionInput['requirement'],
): PlannedDocumentActionInput {
  const vehicleLink = ctx.input.entityLinks.find(
    (link) => String(link.entityType).toUpperCase() === 'VEHICLE' && link.entityId?.trim(),
  );
  return {
    actionType: 'CREATE_FINE',
    requirement,
    targetEntityType: 'VEHICLE',
    targetEntityId: vehicleLink?.entityId?.trim() ?? ctx.vehicleEntityId,
    sequence,
    inputPayload: buildFineDraftPayload(ctx),
    previewPayload: {
      semanticAction: FINE_SEMANTIC_ACTIONS.CREATE_FINE_DRAFT,
      wouldCreate: 'fine_draft',
      ...buildFineDraftPayload(ctx),
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
      note: 'Entity link is created only after explicit operator confirmation.',
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
  semanticAction: FineSemanticAction,
  sequence: number,
  payload: Record<string, unknown>,
): PlannedDocumentActionInput {
  return {
    actionType: 'SUGGEST_TASK',
    requirement: 'OPTIONAL',
    sequence,
    inputPayload: {
      semanticAction,
      noAutomaticContact: true,
      ...payload,
    },
    previewPayload: {
      semanticAction,
      wouldSuggest: semanticAction,
      noAutomaticContact: true,
      ...payload,
    },
  };
}

function canSuggestAttributionForEntity(
  entityType: DocumentEntityType,
  input: DocumentActionPlannerInput,
  attributionBlockers: DocumentActionBlockingReason[],
): boolean {
  if (!ATTRIBUTION_ENTITY_TYPES.includes(entityType)) {
    return true;
  }
  if (attributionBlockers.some((blocker) => blocker.code === 'MISSING_OFFENSE_TIME')) {
    return false;
  }
  if (
    entityType === 'DRIVER' &&
    attributionBlockers.some((blocker) => blocker.code === 'MULTIPLE_DRIVER_CANDIDATES')
  ) {
    return false;
  }
  if (entityType === 'DRIVER' && hasConfirmedEntityLink(input.entityLinks, 'CUSTOMER')) {
    return !hasConfirmedEntityLink(input.entityLinks, 'DRIVER');
  }
  return true;
}

export function buildFinePlannerActions(
  ctx: DocumentActionPlannerBuildContext,
): PlannedDocumentActionInput[] {
  const mode = resolveFineDocumentMode(ctx.input);
  const assessment = assessFineDraftRequirements(ctx.input);
  const attributionBlockers = collectFineAttributionBlockers(ctx.input);
  const actions: PlannedDocumentActionInput[] = [];
  let sequence = 0;

  if (mode === FINE_DOCUMENT_MODES.FINE_NOTICE && assessment.canCreateFineDraft) {
    sequence += 1;
    actions.push(buildFineDraftAction(ctx, sequence, 'REQUIRED'));
  }

  for (const entityType of LINK_ENTITY_TYPES) {
    if (entityType === 'CUSTOMER' && hasConfirmedEntityLink(ctx.input.entityLinks, 'DRIVER')) {
      continue;
    }
    if (!canSuggestAttributionForEntity(entityType, ctx.input, attributionBlockers)) {
      continue;
    }
    const candidate = findUnconfirmedLinkCandidate(ctx.input, entityType);
    if (!candidate) continue;
    sequence += 1;
    actions.push(buildLinkSuggestionAction(entityType, candidate, sequence));
  }

  if (mode === FINE_DOCUMENT_MODES.HEARING_FORM) {
    sequence += 1;
    actions.push(
      buildSuggestionAction(FINE_SEMANTIC_ACTIONS.SUGGEST_DRIVER_REVIEW, sequence, {
        reason: 'hearing_form_requires_review',
        hearingForm: true,
        note: 'Anhörungsbogen must not be treated as a finalized fine.',
      }),
    );
  } else if (mode === FINE_DOCUMENT_MODES.DRIVER_INQUIRY) {
    sequence += 1;
    actions.push(
      buildSuggestionAction(FINE_SEMANTIC_ACTIONS.SUGGEST_DRIVER_REVIEW, sequence, {
        reason: 'driver_inquiry',
      }),
    );
  } else if (
    !hasConfirmedEntityLink(ctx.input.entityLinks, 'DRIVER') &&
    !assessment.canCreateFineDraft
  ) {
    sequence += 1;
    actions.push(
      buildSuggestionAction(FINE_SEMANTIC_ACTIONS.SUGGEST_DRIVER_REVIEW, sequence, {
        reason: 'driver_not_linked',
      }),
    );
  }

  if (hasNonEmptyField(ctx.input.confirmedData, 'dueDate')) {
    sequence += 1;
    actions.push(
      buildSuggestionAction(FINE_SEMANTIC_ACTIONS.SUGGEST_DEADLINE_TASK, sequence, {
        dueDate: ctx.input.confirmedData.dueDate,
      }),
    );
  }

  if (
    findUnconfirmedLinkCandidate(ctx.input, 'CUSTOMER') &&
    !hasConfirmedEntityLink(ctx.input.entityLinks, 'CUSTOMER')
  ) {
    sequence += 1;
    actions.push(
      buildSuggestionAction(FINE_SEMANTIC_ACTIONS.SUGGEST_CUSTOMER_CONTACT, sequence, {
        reason: 'customer_contact_suggestion_only',
      }),
    );
  }

  return actions;
}

export function resolveFineFollowUpCandidateTypes(
  mode: FineDocumentMode,
  canCreateFineDraft: boolean,
): DocumentFollowUpCandidateType[] {
  const followUps: DocumentFollowUpCandidateType[] = ['MANUAL_REVIEW'];
  if (mode === FINE_DOCUMENT_MODES.DRIVER_INQUIRY || !canCreateFineDraft) {
    followUps.push('CREATE_TASK');
  }
  return [...new Set(followUps)].sort();
}

export function buildFinePlannerSummary(
  mode: FineDocumentMode,
  canCreateFineDraft: boolean,
  actionCount: number,
): string {
  if (mode === FINE_DOCUMENT_MODES.HEARING_FORM) {
    return `Hearing form plan: ${actionCount} action(s); fine draft suppressed pending review.`;
  }
  if (mode === FINE_DOCUMENT_MODES.DRIVER_INQUIRY) {
    return `Driver inquiry plan: ${actionCount} action(s); no automatic fine draft.`;
  }
  if (!canCreateFineDraft) {
    return `Fine notice plan blocked: missing required fine draft fields.`;
  }
  return `Fine notice plan: ${actionCount} action(s) including fine draft preview.`;
}

export function extractFineSemanticAction(
  payload: Record<string, unknown> | null | undefined,
): FineSemanticAction | null {
  const value = payload?.semanticAction;
  if (typeof value !== 'string') return null;
  return Object.values(FINE_SEMANTIC_ACTIONS).includes(value as FineSemanticAction)
    ? (value as FineSemanticAction)
    : null;
}
