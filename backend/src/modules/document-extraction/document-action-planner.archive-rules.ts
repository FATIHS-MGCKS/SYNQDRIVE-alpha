import type { DocumentEntityType, DocumentExtractionType } from '@prisma/client';
import type { PlannedDocumentActionInput } from './document-action.types';
import type {
  DocumentActionPlannerBuildContext,
  DocumentActionPlannerInput,
  DocumentFollowUpCandidateType,
} from './document-action-planner.types';

/** Semantic planner action kinds for documents without safe downstream apply. */
export const ARCHIVE_ONLY_SEMANTIC_ACTIONS = {
  ARCHIVE_DOCUMENT: 'ARCHIVE_DOCUMENT',
  LINK_VEHICLE: 'LINK_VEHICLE',
  LINK_BOOKING: 'LINK_BOOKING',
  LINK_CUSTOMER: 'LINK_CUSTOMER',
  LINK_DRIVER: 'LINK_DRIVER',
  LINK_VENDOR: 'LINK_VENDOR',
  SUGGEST_OWNER_REVIEW: 'SUGGEST_OWNER_REVIEW',
} as const;

export type ArchiveOnlySemanticAction =
  (typeof ARCHIVE_ONLY_SEMANTIC_ACTIONS)[keyof typeof ARCHIVE_ONLY_SEMANTIC_ACTIONS];

/** Canonical archive-only document subtype keys (stored in `documentSubtype`). */
export const ARCHIVE_ONLY_DOCUMENT_SUBTYPES = {
  GENERAL_LETTER: 'GENERAL_LETTER',
  CUSTOMER_CORRESPONDENCE: 'CUSTOMER_CORRESPONDENCE',
  DRIVER_DOCUMENT: 'DRIVER_DOCUMENT',
  INSURANCE_NOTICE: 'INSURANCE_NOTICE',
  PAYMENT_PROOF: 'PAYMENT_PROOF',
  GENERAL_PROOF: 'GENERAL_PROOF',
  UNKNOWN_DOCUMENT_TYPE: 'UNKNOWN_DOCUMENT_TYPE',
} as const;

export type ArchiveOnlyDocumentSubtype =
  (typeof ARCHIVE_ONLY_DOCUMENT_SUBTYPES)[keyof typeof ARCHIVE_ONLY_DOCUMENT_SUBTYPES];

const ARCHIVE_ONLY_SUBTYPE_SET = new Set<string>(Object.values(ARCHIVE_ONLY_DOCUMENT_SUBTYPES));

const DOWNSTREAM_APPLY_TYPES = new Set<DocumentExtractionType>([
  'SERVICE',
  'OIL_CHANGE',
  'TUV_REPORT',
  'BOKRAFT_REPORT',
  'BRAKE',
  'TIRE',
  'BATTERY',
  'DAMAGE',
  'ACCIDENT',
  'INVOICE',
  'FINE',
]);

const LINK_ENTITY_TYPES: DocumentEntityType[] = [
  'VEHICLE',
  'BOOKING',
  'CUSTOMER',
  'DRIVER',
  'VENDOR',
];

const SEMANTIC_LINK_BY_ENTITY: Record<DocumentEntityType, ArchiveOnlySemanticAction> = {
  VEHICLE: ARCHIVE_ONLY_SEMANTIC_ACTIONS.LINK_VEHICLE,
  BOOKING: ARCHIVE_ONLY_SEMANTIC_ACTIONS.LINK_BOOKING,
  CUSTOMER: ARCHIVE_ONLY_SEMANTIC_ACTIONS.LINK_CUSTOMER,
  DRIVER: ARCHIVE_ONLY_SEMANTIC_ACTIONS.LINK_DRIVER,
  VENDOR: ARCHIVE_ONLY_SEMANTIC_ACTIONS.LINK_VENDOR,
  ORGANIZATION: ARCHIVE_ONLY_SEMANTIC_ACTIONS.LINK_CUSTOMER,
};

export function normalizeArchiveDocumentSubtype(
  subtype: string | null | undefined,
): string | null {
  if (!subtype?.trim()) return null;
  return subtype.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function isKnownArchiveOnlySubtype(subtype: string | null | undefined): boolean {
  const normalized = normalizeArchiveDocumentSubtype(subtype);
  return normalized != null && ARCHIVE_ONLY_SUBTYPE_SET.has(normalized);
}

export function resolveArchiveOnlySubtype(
  input: Pick<DocumentActionPlannerInput, 'documentSubtype' | 'effectiveDocumentType'>,
): ArchiveOnlyDocumentSubtype | typeof ARCHIVE_ONLY_DOCUMENT_SUBTYPES.UNKNOWN_DOCUMENT_TYPE {
  const normalized = normalizeArchiveDocumentSubtype(input.documentSubtype);
  if (normalized && ARCHIVE_ONLY_SUBTYPE_SET.has(normalized)) {
    return normalized as ArchiveOnlyDocumentSubtype;
  }
  if (!input.effectiveDocumentType || input.effectiveDocumentType === 'AUTO') {
    return ARCHIVE_ONLY_DOCUMENT_SUBTYPES.UNKNOWN_DOCUMENT_TYPE;
  }
  if (input.effectiveDocumentType === 'OTHER') {
    return ARCHIVE_ONLY_DOCUMENT_SUBTYPES.GENERAL_LETTER;
  }
  return ARCHIVE_ONLY_DOCUMENT_SUBTYPES.GENERAL_PROOF;
}

/**
 * Documents that must never receive downstream service/invoice/fine/damage apply actions.
 */
export function isArchiveOnlyDocumentProfile(input: DocumentActionPlannerInput): boolean {
  const effectiveType = input.effectiveDocumentType;
  if (effectiveType && DOWNSTREAM_APPLY_TYPES.has(effectiveType)) {
    if (!isKnownArchiveOnlySubtype(input.documentSubtype)) {
      return false;
    }
  }

  if (isKnownArchiveOnlySubtype(input.documentSubtype)) {
    return true;
  }

  if (input.documentCategory === 'GENERAL') {
    return true;
  }

  if (effectiveType === 'OTHER' || effectiveType === 'VEHICLE_CONDITION') {
    return true;
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

function buildArchiveDocumentAction(
  ctx: DocumentActionPlannerBuildContext,
  sequence: number,
  archiveSubtype: string,
): PlannedDocumentActionInput {
  return {
    actionType: 'ARCHIVE_ONLY',
    requirement: 'INFORMATIONAL',
    targetEntityType: null,
    targetEntityId: null,
    sequence,
    inputPayload: {
      semanticAction: ARCHIVE_ONLY_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT,
      archiveOnlyProfile: archiveSubtype,
      confirmedFieldKeys: Object.keys(ctx.input.confirmedData).sort(),
      validSuccessOutcome: true,
    },
    previewPayload: {
      semanticAction: ARCHIVE_ONLY_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT,
      wouldArchive: true,
      archiveOnlyProfile: archiveSubtype,
      validSuccessOutcome: true,
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

function buildOwnerReviewSuggestion(
  archiveSubtype: string,
  sequence: number,
): PlannedDocumentActionInput {
  return {
    actionType: 'SUGGEST_TASK',
    requirement: 'OPTIONAL',
    sequence,
    inputPayload: {
      semanticAction: ARCHIVE_ONLY_SEMANTIC_ACTIONS.SUGGEST_OWNER_REVIEW,
      archiveOnlyProfile: archiveSubtype,
      reason: 'unclear_or_general_document',
    },
    previewPayload: {
      semanticAction: ARCHIVE_ONLY_SEMANTIC_ACTIONS.SUGGEST_OWNER_REVIEW,
      wouldSuggest: 'owner_review',
      noAutomaticContact: true,
    },
  };
}

export function shouldSuggestOwnerReview(
  archiveSubtype: string,
  input: Pick<DocumentActionPlannerInput, 'effectiveDocumentType' | 'documentSubtype'>,
): boolean {
  if (archiveSubtype === ARCHIVE_ONLY_DOCUMENT_SUBTYPES.UNKNOWN_DOCUMENT_TYPE) {
    return true;
  }
  if (!input.effectiveDocumentType || input.effectiveDocumentType === 'AUTO') {
    return true;
  }
  if (normalizeArchiveDocumentSubtype(input.documentSubtype) === ARCHIVE_ONLY_DOCUMENT_SUBTYPES.UNKNOWN_DOCUMENT_TYPE) {
    return true;
  }
  return false;
}

export function buildArchiveOnlyPlannerActions(
  ctx: DocumentActionPlannerBuildContext,
): PlannedDocumentActionInput[] {
  const archiveSubtype = resolveArchiveOnlySubtype(ctx.input);
  const actions: PlannedDocumentActionInput[] = [];
  let sequence = 0;

  sequence += 1;
  actions.push(buildArchiveDocumentAction(ctx, sequence, archiveSubtype));

  for (const entityType of LINK_ENTITY_TYPES) {
    const candidate = findUnconfirmedLinkCandidate(ctx.input, entityType);
    if (!candidate) continue;
    sequence += 1;
    actions.push(buildLinkSuggestionAction(entityType, candidate, sequence));
  }

  if (shouldSuggestOwnerReview(archiveSubtype, ctx.input)) {
    sequence += 1;
    actions.push(buildOwnerReviewSuggestion(archiveSubtype, sequence));
  }

  return actions;
}

export function resolveArchiveOnlyFollowUpCandidateTypes(
  archiveSubtype: string,
): DocumentFollowUpCandidateType[] {
  const followUps: DocumentFollowUpCandidateType[] = ['MANUAL_REVIEW'];
  if (archiveSubtype === ARCHIVE_ONLY_DOCUMENT_SUBTYPES.UNKNOWN_DOCUMENT_TYPE) {
    followUps.push('CREATE_TASK');
  }
  return [...new Set(followUps)].sort();
}

export function buildArchiveOnlyPlannerSummary(archiveSubtype: string, actionCount: number): string {
  return `Archive-only plan for ${archiveSubtype}: ${actionCount} action(s); no downstream service/invoice/fine/damage writes.`;
}

export function extractSemanticAction(
  payload: Record<string, unknown> | null | undefined,
): ArchiveOnlySemanticAction | null {
  const value = payload?.semanticAction;
  if (typeof value !== 'string') return null;
  return Object.values(ARCHIVE_ONLY_SEMANTIC_ACTIONS).includes(value as ArchiveOnlySemanticAction)
    ? (value as ArchiveOnlySemanticAction)
    : null;
}
