import type { ApplyDocumentExtractionType } from './document-extraction.schemas';
import type { PlausibilityResult } from './document-extraction-plausibility.service';

export type DocumentApplySafetyDecision =
  | 'APPLY_ALLOWED'
  | 'DRAFT_ONLY'
  | 'ARCHIVE_ONLY'
  | 'BLOCKED'
  | 'LEGACY_DISABLED';

export type DocumentApplyImplementationStatus = 'implemented' | 'archive_only' | 'disabled';

export interface DocumentApplyFeatureFlags {
  masterApplyEnabled: boolean;
  perTypeApplyEnabled: Partial<Record<ApplyDocumentExtractionType, boolean>>;
  strictIdempotency: boolean;
}

export interface DocumentApplySafetyInput {
  documentType: ApplyDocumentExtractionType;
  confirmedData: Record<string, unknown>;
  plausibility?: PlausibilityResult | null;
  vehicleId?: string | null;
  organizationId?: string | null;
  extractionId?: string | null;
  featureFlags?: DocumentApplyFeatureFlags;
}

export interface DocumentApplySafetyResult {
  decision: DocumentApplySafetyDecision;
  reasons: string[];
  /** Confirmed field keys still missing for apply — for UI highlighting. */
  missingFields: string[];
  allowsDownstreamApply: boolean;
  implementationStatus: DocumentApplyImplementationStatus;
  downstreamIdempotency: 'strong' | 'weak' | 'none';
}

export interface PublicDocumentApplySafetyDto {
  decision: DocumentApplySafetyDecision;
  reasons: string[];
  missingFields: string[];
  allowsDownstreamApply: boolean;
  implementationStatus: DocumentApplyImplementationStatus;
  downstreamIdempotency: 'strong' | 'weak' | 'none';
}
