import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type { ConfidenceLevel, EntityCandidateType } from '../entity-candidate-ranking.types';

export type DocumentIntakeScope = 'org' | 'vehicle';
export type DocumentUploadRejectedReason =
  | 'rate_limit'
  | 'mime'
  | 'identification'
  | 'malware'
  | 'validation'
  | 'duplicate'
  | 'queue';
export type DocumentDuplicateOutcome =
  | 'unique'
  | 'blocked'
  | 'business_duplicate'
  | 'reupload_allowed';
export type DocumentClassificationResult =
  | 'auto_continue'
  | 'await_user'
  | 'await_user_with_suggestion'
  | 'unknown';
export type DocumentAwaitingTypeSource = 'classification' | 'no_type';
export type DocumentActionPlanOutcome = 'preview' | 'ready' | 'executing' | 'completed' | 'failed';
export type DocumentActionOutcome = 'succeeded' | 'skipped' | 'failed';
export type DocumentPartialApplyReason =
  | 'optional_failed'
  | 'partial_lifecycle'
  | 'applied_with_warnings';
export type DocumentRecoveryKind = 'pipeline' | 'action';
export type DocumentRecoveryOutcome = 'recovered' | 'dead_letter' | 'skipped';
export type DocumentFollowUpOutcome =
  | 'suggested'
  | 'accepted'
  | 'dismissed'
  | 'task_created';
export type DocumentArchiveOutcome = 'indexed' | 'applied' | 'skipped';
export type DocumentRequiredFieldPresence = 'present' | 'missing';
export type DocumentRequiredFieldRequirement = 'required' | 'optional';

const DOCUMENT_CATEGORY_BY_TYPE: Record<string, string> = {
  FINE: 'FINE',
  INVOICE: 'INVOICE',
  CREDIT_NOTE: 'INVOICE',
  SERVICE: 'SERVICE',
  OIL_CHANGE: 'SERVICE',
  TIRE: 'TECHNICAL',
  BRAKE: 'TECHNICAL',
  BATTERY: 'TECHNICAL',
  TUV_REPORT: 'COMPLIANCE',
  BOKRAFT_REPORT: 'COMPLIANCE',
  DAMAGE: 'DAMAGE',
  ACCIDENT: 'DAMAGE',
  AUTHORITY_LETTER: 'ARCHIVE',
  REGISTRATION_CERTIFICATE: 'ARCHIVE',
  INSURANCE_POLICY: 'ARCHIVE',
  OTHER: 'OTHER',
};

export function toDocumentIntakeCategory(documentType: string | null | undefined): string {
  if (!documentType) return 'UNKNOWN';
  return DOCUMENT_CATEGORY_BY_TYPE[documentType] ?? 'OTHER';
}

export function recordDocumentUpload(
  metrics: TripMetricsService,
  input: { scope: DocumentIntakeScope; sourceSurface: string },
): void {
  metrics.documentUploadTotal.inc({
    scope: input.scope,
    source_surface: normalizeBoundedLabel(input.sourceSurface, 32, 'unknown'),
  });
}

export function recordDocumentUploadRejected(
  metrics: TripMetricsService,
  input: { reason: DocumentUploadRejectedReason },
): void {
  metrics.documentUploadRejectedTotal.inc({ reason: input.reason });
}

export function recordDocumentDuplicate(
  metrics: TripMetricsService,
  input: { outcome: DocumentDuplicateOutcome },
): void {
  metrics.documentDuplicateTotal.inc({ outcome: input.outcome });
}

export function recordDocumentOcr(
  metrics: TripMetricsService,
  input: { method: string },
): void {
  metrics.documentOcrTotal.inc({
    method: normalizeBoundedLabel(input.method, 24, 'unknown'),
  });
}

export function recordDocumentOcrFailed(
  metrics: TripMetricsService,
  input: { errorCode: string; retryable: boolean },
): void {
  metrics.documentOcrFailedTotal.inc({
    error_code: normalizeBoundedLabel(input.errorCode, 48, 'UNKNOWN'),
    retryable: input.retryable ? 'true' : 'false',
  });
}

export function recordDocumentClassification(
  metrics: TripMetricsService,
  input: { result: DocumentClassificationResult },
): void {
  metrics.documentClassificationTotal.inc({ result: input.result });
}

export function recordDocumentAwaitingType(
  metrics: TripMetricsService,
  input: { source: DocumentAwaitingTypeSource },
): void {
  metrics.documentAwaitingTypeTotal.inc({ source: input.source });
}

export function recordDocumentExtractionCompleted(
  metrics: TripMetricsService,
  input: { documentCategory: string; overallStatus: string },
): void {
  metrics.documentExtractionTotal.inc({
    document_category: input.documentCategory,
    overall_status: normalizeBoundedLabel(input.overallStatus, 24, 'UNKNOWN'),
  });
}

export function recordDocumentPlausibilityBlocker(
  metrics: TripMetricsService,
  input: { blockerCode: string },
  count = 1,
): void {
  metrics.documentPlausibilityBlockerTotal.inc(
    { blocker_code: normalizeBoundedLabel(input.blockerCode, 64, 'UNKNOWN') },
    count,
  );
}

export function recordDocumentEntityCandidate(
  metrics: TripMetricsService,
  input: {
    entityType: EntityCandidateType | string;
    confidence: ConfidenceLevel | string;
  },
  count = 1,
): void {
  metrics.documentEntityCandidateTotal.inc(
    {
      entity_type: normalizeBoundedLabel(input.entityType, 24, 'UNKNOWN'),
      confidence: normalizeBoundedLabel(input.confidence, 16, 'LOW'),
    },
    count,
  );
}

export function recordDocumentRequiredField(
  metrics: TripMetricsService,
  input: {
    requirement: DocumentRequiredFieldRequirement;
    presence: DocumentRequiredFieldPresence;
    documentCategory: string;
  },
  count = 1,
): void {
  metrics.documentRequiredFieldTotal.inc(
    {
      requirement: input.requirement,
      presence: input.presence,
      document_category: input.documentCategory,
    },
    count,
  );
}

export function recordDocumentActionPlan(
  metrics: TripMetricsService,
  input: { documentCategory: string; outcome: DocumentActionPlanOutcome },
): void {
  metrics.documentActionPlanTotal.inc({
    document_category: input.documentCategory,
    outcome: input.outcome,
  });
}

export function recordDocumentAction(
  metrics: TripMetricsService,
  input: {
    semanticAction: string;
    outcome: DocumentActionOutcome;
  },
): void {
  metrics.documentActionTotal.inc({
    semantic_action: normalizeBoundedLabel(input.semanticAction, 48, 'UNKNOWN'),
    outcome: input.outcome,
  });
}

export function recordDocumentActionFailed(
  metrics: TripMetricsService,
  input: {
    semanticAction: string;
    errorCode: string;
  },
): void {
  metrics.documentActionFailedTotal.inc({
    semantic_action: normalizeBoundedLabel(input.semanticAction, 48, 'UNKNOWN'),
    error_code: normalizeBoundedLabel(input.errorCode, 48, 'UNKNOWN'),
  });
}

export function recordDocumentPartialApply(
  metrics: TripMetricsService,
  input: { reason: DocumentPartialApplyReason },
): void {
  metrics.documentPartialApplyTotal.inc({ reason: input.reason });
}

export function recordDocumentRecovery(
  metrics: TripMetricsService,
  input: { kind: DocumentRecoveryKind; outcome: DocumentRecoveryOutcome },
): void {
  metrics.documentRecoveryTotal.inc({
    kind: input.kind,
    outcome: input.outcome,
  });
}

export function recordDocumentFollowUp(
  metrics: TripMetricsService,
  input: {
    followUpType: string;
    outcome: DocumentFollowUpOutcome;
  },
): void {
  metrics.documentFollowUpTotal.inc({
    follow_up_type: normalizeBoundedLabel(input.followUpType, 48, 'UNKNOWN'),
    outcome: input.outcome,
  });
}

export function recordDocumentArchive(
  metrics: TripMetricsService,
  input: { outcome: DocumentArchiveOutcome },
): void {
  metrics.documentArchiveTotal.inc({ outcome: input.outcome });
}

function normalizeBoundedLabel(
  value: string,
  maxLength: number,
  fallback: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const normalized = trimmed
    .replace(/[^a-zA-Z0-9_:-]+/g, '_')
    .slice(0, maxLength);
  return normalized || fallback;
}
