import { LEGAL_STATUS } from './documents.constants';
import {
  LEGAL_DOCUMENT_RESOLVER_ELIGIBLE_STATUS,
  LEGAL_DOCUMENT_RESOLVER_EXCLUDED_STATUSES,
} from './legal-document-resolver.constants';
import type {
  LegalDocumentEvaluatedContext,
  LegalDocumentResolverCandidate,
} from './legal-document-resolver.types';
import {
  bookingChannelsOverlap,
  customerSegmentsOverlap,
  detectScopeConflicts,
  productScopesOverlap,
  scopeFingerprint,
  stationScopesOverlap,
  compareScopePriority,
  type LegalDocumentScopeShape,
} from './legal-document-scope.conflicts';
import {
  LEGAL_CUSTOMER_SEGMENT,
  LEGAL_STATION_SCOPE_MODE,
} from './legal-document-scope.constants';

export type CandidateExclusionReason =
  | 'STATUS_NOT_ACTIVE'
  | 'STATUS_REVOKED'
  | 'STATUS_ARCHIVED'
  | 'STATUS_SUPERSEDED'
  | 'STATUS_NOT_RELEASED'
  | 'NOT_YET_VALID'
  | 'EXPIRED'
  | 'LANGUAGE_MISMATCH'
  | 'JURISDICTION_MISMATCH'
  | 'CUSTOMER_SEGMENT_MISMATCH'
  | 'BOOKING_CHANNEL_MISMATCH'
  | 'PRODUCT_SCOPE_MISMATCH'
  | 'STATION_SCOPE_MISMATCH';

export function isDocumentValidAt(
  doc: Pick<LegalDocumentResolverCandidate, 'validFrom' | 'validUntil'>,
  at: Date,
): boolean {
  if (doc.validFrom && doc.validFrom > at) return false;
  if (doc.validUntil && doc.validUntil <= at) return false;
  return true;
}

export function getStatusExclusionReason(status: string): CandidateExclusionReason | null {
  if (status === LEGAL_DOCUMENT_RESOLVER_ELIGIBLE_STATUS) return null;
  if (status === LEGAL_STATUS.REVOKED) return 'STATUS_REVOKED';
  if (status === LEGAL_STATUS.ARCHIVED) return 'STATUS_ARCHIVED';
  if (status === LEGAL_STATUS.SUPERSEDED) return 'STATUS_SUPERSEDED';
  if ((LEGAL_DOCUMENT_RESOLVER_EXCLUDED_STATUSES as readonly string[]).includes(status)) {
    return 'STATUS_NOT_RELEASED';
  }
  return 'STATUS_NOT_ACTIVE';
}

export function candidateToScopeShape(
  doc: LegalDocumentResolverCandidate,
): LegalDocumentScopeShape {
  return {
    id: doc.id,
    organizationId: doc.organizationId,
    documentType: doc.documentType,
    legalVariant: doc.legalVariant,
    language: doc.language,
    jurisdictionCountry: doc.jurisdictionCountry,
    customerSegment: doc.customerSegment,
    bookingChannel: doc.bookingChannel,
    productScope: doc.productScope,
    stationScopeMode: doc.stationScopeMode,
    stationIds: doc.stationIds,
    priority: doc.priority,
    noticePurpose: doc.noticePurpose,
    validFrom: doc.validFrom,
    validUntil: doc.validUntil,
    status: doc.status,
  };
}

export function contextToScopeQuery(
  ctx: LegalDocumentEvaluatedContext,
  documentType: string,
): LegalDocumentScopeShape {
  return {
    documentType,
    language: ctx.customerLanguage ?? '',
    jurisdictionCountry: ctx.jurisdiction ?? '',
    customerSegment: ctx.customerSegment ?? LEGAL_CUSTOMER_SEGMENT.BOTH,
    bookingChannel: ctx.bookingChannel ?? 'ALL',
    productScope: ctx.productScope,
    stationScopeMode: ctx.stationId
      ? LEGAL_STATION_SCOPE_MODE.STATION_SPECIFIC
      : LEGAL_STATION_SCOPE_MODE.ORGANIZATION_WIDE,
    stationIds: ctx.stationId ? [ctx.stationId] : [],
    priority: 0,
  };
}

export function documentMatchesContext(
  doc: LegalDocumentResolverCandidate,
  ctx: LegalDocumentEvaluatedContext,
  at: Date,
): { matches: boolean; reason?: CandidateExclusionReason } {
  const statusReason = getStatusExclusionReason(doc.status);
  if (statusReason) return { matches: false, reason: statusReason };

  if (!isDocumentValidAt(doc, at)) {
    if (doc.validFrom && doc.validFrom > at) return { matches: false, reason: 'NOT_YET_VALID' };
    return { matches: false, reason: 'EXPIRED' };
  }

  if (!ctx.customerLanguage || doc.language !== ctx.customerLanguage) {
    return { matches: false, reason: 'LANGUAGE_MISMATCH' };
  }
  if (!ctx.jurisdiction || doc.jurisdictionCountry !== ctx.jurisdiction) {
    return { matches: false, reason: 'JURISDICTION_MISMATCH' };
  }
  if (
    !ctx.customerSegment ||
    !customerSegmentsOverlap(doc.customerSegment, ctx.customerSegment)
  ) {
    return { matches: false, reason: 'CUSTOMER_SEGMENT_MISMATCH' };
  }
  if (!ctx.bookingChannel || !bookingChannelsOverlap(doc.bookingChannel, ctx.bookingChannel)) {
    return { matches: false, reason: 'BOOKING_CHANNEL_MISMATCH' };
  }
  if (!productScopesOverlap(doc.productScope, ctx.productScope)) {
    return { matches: false, reason: 'PRODUCT_SCOPE_MISMATCH' };
  }

  const ctxStation = {
    stationScopeMode: ctx.stationId
      ? LEGAL_STATION_SCOPE_MODE.STATION_SPECIFIC
      : LEGAL_STATION_SCOPE_MODE.ORGANIZATION_WIDE,
    stationIds: ctx.stationId ? [ctx.stationId] : [],
  };
  if (!stationScopesOverlap(doc, ctxStation)) {
    return { matches: false, reason: 'STATION_SCOPE_MISMATCH' };
  }

  return { matches: true };
}

export function selectBestCandidate(
  candidates: LegalDocumentResolverCandidate[],
): LegalDocumentResolverCandidate | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) =>
    compareScopePriority(
      { priority: a.priority, id: a.id },
      { priority: b.priority, id: b.id },
    ),
  );
  return sorted[0] ?? null;
}

export function detectResolverConflicts(
  candidates: LegalDocumentResolverCandidate[],
  documentType: string,
) {
  const shapes = candidates.map(candidateToScopeShape);
  return detectScopeConflicts(shapes).map((c) => ({ ...c, documentType }));
}

export function buildSelection(
  doc: LegalDocumentResolverCandidate,
  matchedCount: number,
  reason: string,
): import('./legal-document-resolver.types').LegalDocumentSelection {
  return {
    documentType: doc.documentType,
    legalDocumentId: doc.id,
    legalVariant: doc.legalVariant,
    noticePurpose: doc.noticePurpose,
    versionLabel: doc.versionLabel,
    title: doc.title,
    priority: doc.priority,
    selectionReason: reason,
    scopeFingerprint: scopeFingerprint(candidateToScopeShape(doc)),
    matchedCandidateCount: matchedCount,
  };
}
