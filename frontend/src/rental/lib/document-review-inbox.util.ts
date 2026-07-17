import type {
  PublicDocumentExtractionArchiveItem,
  PublicDocumentExtractionSummary,
} from './document-extraction.types';

export type DocumentReviewReason =
  | 'unclear_type'
  | 'entity_assignment_open'
  | 'required_fields_missing'
  | 'plausibility_conflict'
  | 'action_preview_open'
  | 'apply_failed'
  | 'follow_up_open';

export type DocumentReviewReasonFilter = 'all' | DocumentReviewReason;

const REVIEW_STATUSES = new Set([
  'AWAITING_DOCUMENT_TYPE',
  'READY_FOR_REVIEW',
  'FAILED',
  'PARTIALLY_APPLIED',
  'CONFIRMED',
]);

export function isReviewInboxArchiveItem(item: PublicDocumentExtractionArchiveItem): boolean {
  if (REVIEW_STATUSES.has(item.status)) return true;
  if (item.followUpSummary.status === 'OPEN' || item.followUpSummary.status === 'MIXED') {
    return true;
  }
  if (['FAILED', 'PARTIAL', 'READY', 'APPLYING'].includes(item.actionSummary.status)) {
    return item.status !== 'APPLIED' || item.followUpSummary.openCount > 0;
  }
  return false;
}

export function isReviewInboxSummaryItem(item: PublicDocumentExtractionSummary): boolean {
  if (REVIEW_STATUSES.has(item.status)) return true;
  if (item.status === 'APPLIED') return false;
  return item.allowedActions?.includes('confirm') || item.allowedActions?.includes('retry');
}

export function deriveReviewReasonsFromArchiveItem(
  item: PublicDocumentExtractionArchiveItem,
): DocumentReviewReason[] {
  const reasons: DocumentReviewReason[] = [];
  if (item.status === 'AWAITING_DOCUMENT_TYPE') {
    reasons.push('unclear_type');
  }
  if (item.status === 'READY_FOR_REVIEW') {
    reasons.push('action_preview_open');
  }
  if (item.actionSummary.status === 'FAILED' || item.status === 'FAILED') {
    reasons.push('apply_failed');
  }
  if (item.actionSummary.status === 'PARTIAL' || item.status === 'PARTIALLY_APPLIED') {
    reasons.push('apply_failed');
  }
  if (item.followUpSummary.status === 'OPEN' || item.followUpSummary.openCount > 0) {
    reasons.push('follow_up_open');
  }
  if (item.status === 'READY_FOR_REVIEW' && item.acceptedEntityLinks.length === 0) {
    reasons.push('entity_assignment_open');
  }
  return [...new Set(reasons)];
}

export function deriveReviewReasonsFromRecord(input: {
  status: string;
  plausibility?: { overallStatus?: string; checks?: Array<{ severity?: string }> } | null;
  missingRequiredFields?: string[];
  entityLinksIncomplete?: boolean;
  actionPreviewBlocked?: boolean;
  applyFailed?: boolean;
  followUpOpen?: boolean;
}): DocumentReviewReason[] {
  const reasons: DocumentReviewReason[] = [];
  if (input.status === 'AWAITING_DOCUMENT_TYPE') reasons.push('unclear_type');
  if (input.entityLinksIncomplete) reasons.push('entity_assignment_open');
  if ((input.missingRequiredFields?.length ?? 0) > 0) reasons.push('required_fields_missing');
  const plausibility = input.plausibility;
  if (
    plausibility?.overallStatus === 'BLOCKER' ||
    plausibility?.overallStatus === 'WARNING' ||
    plausibility?.checks?.some((row) => row.severity === 'BLOCKER' || row.severity === 'WARNING')
  ) {
    reasons.push('plausibility_conflict');
  }
  if (input.actionPreviewBlocked || input.status === 'READY_FOR_REVIEW') {
    reasons.push('action_preview_open');
  }
  if (input.applyFailed || input.status === 'FAILED' || input.status === 'PARTIALLY_APPLIED') {
    reasons.push('apply_failed');
  }
  if (input.followUpOpen) reasons.push('follow_up_open');
  return [...new Set(reasons)];
}

export function matchesReviewReasonFilter(
  reasons: DocumentReviewReason[],
  filter: DocumentReviewReasonFilter,
): boolean {
  if (filter === 'all') return reasons.length > 0;
  return reasons.includes(filter);
}

export function archiveItemToSummary(
  item: PublicDocumentExtractionArchiveItem,
): PublicDocumentExtractionSummary {
  return {
    id: item.id,
    vehicleId: item.vehicleId,
    organizationId: item.organizationId,
    uploadContext: null,
    vehicleCandidates: null,
    bookingCandidates: null,
    customerCandidates: null,
    driverCandidates: null,
    partnerCandidates: null,
    partnerNewSuggestion: null,
    entityCandidateRanking: null,
    vehicle: item.vehicle,
    status: item.status,
    processingStage: 'REVIEW',
    sourceFileName: item.sourceFileName,
    mimeType: item.mimeType,
    sizeBytes: null,
    requestedDocumentType: null,
    detectedDocumentType: null,
    effectiveDocumentType: item.effectiveDocumentType,
    documentType: item.effectiveDocumentType,
    classificationMode: 'AUTO',
    classificationConfidence: null,
    documentCategory: item.documentCategory,
    documentSubtype: item.documentSubtype,
    documentTaxonomyVersion: null,
    archiveRecommended: false,
    errorPhase: null,
    errorCode: null,
    errorMessage: null,
    processingAttempts: 0,
    extractedData: null,
    confirmedData: null,
    plausibility: null,
    fieldProvenance: null,
    fieldCorrectionCount: null,
    queuedAt: null,
    appliedAt: item.appliedAt,
    createdAt: item.uploadedAt,
    updatedAt: item.updatedAt,
    hasStoredFile: item.canDownload,
    allowedActions: item.canDownload ? ['download'] : [],
    applyResult: null,
  };
}
