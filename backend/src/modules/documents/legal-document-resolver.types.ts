import type { LegalDocumentResolverErrorCode } from './legal-document-resolver.constants';
import type { LegalScopeConflict } from './legal-document-scope.conflicts';

export interface LegalDocumentResolverInput {
  organizationId: string;
  bookingId?: string | null;
  customerLanguage?: string | null;
  customerSegment?: 'B2C' | 'B2B' | null;
  jurisdiction?: string | null;
  bookingChannel?: string | null;
  productScope?: string | null;
  stationId?: string | null;
  effectiveTimestamp?: Date | string | null;
  /** When omitted, all org legal document types are evaluated. */
  documentTypes?: string[] | null;
}

export interface LegalDocumentEvaluatedContext {
  organizationId: string;
  bookingId: string | null;
  customerLanguage: string | null;
  customerSegment: 'B2C' | 'B2B' | null;
  jurisdiction: string | null;
  bookingChannel: string | null;
  productScope: string | null;
  stationId: string | null;
  effectiveTimestamp: string;
}

export interface LegalDocumentFallbackDecision {
  field: string;
  source: string;
  value: string;
  message: string;
}

export interface LegalDocumentResolverError {
  code: LegalDocumentResolverErrorCode;
  message: string;
  field?: string;
  documentType?: string;
}

export interface LegalDocumentSelection {
  documentType: string;
  legalDocumentId: string;
  legalVariant: string | null;
  noticePurpose: string | null;
  versionLabel: string;
  title: string;
  priority: number;
  selectionReason: string;
  scopeFingerprint: string;
  matchedCandidateCount: number;
}

export interface LegalDocumentMissingMandatory {
  documentType: string;
  isMandatory: boolean;
  reason: string;
  code: typeof import('./legal-document-resolver.constants').LEGAL_DOCUMENT_RESOLVER_ERROR_CODES.MISSING_MANDATORY;
}

export interface LegalDocumentResolverConflict extends LegalScopeConflict {
  documentType: string;
}

export interface LegalDocumentResolverResult {
  resolverVersion: string;
  evaluatedAt: string;
  evaluatedContext: LegalDocumentEvaluatedContext;
  selectedDocuments: LegalDocumentSelection[];
  missingMandatoryDocuments: LegalDocumentMissingMandatory[];
  conflicts: LegalDocumentResolverConflict[];
  fallbackDecisions: LegalDocumentFallbackDecision[];
  errors: LegalDocumentResolverError[];
  /** True when no blocking errors/conflicts and all mandatory types resolved. */
  isComplete: boolean;
}

export interface LegalDocumentResolverCandidate {
  id: string;
  organizationId: string;
  documentType: string;
  legalVariant: string | null;
  title: string;
  versionLabel: string;
  language: string;
  jurisdictionCountry: string;
  customerSegment: string;
  bookingChannel: string;
  productScope: string | null;
  stationScopeMode: string;
  stationIds: string[];
  priority: number;
  isMandatory: boolean;
  noticePurpose: string;
  status: string;
  validFrom: Date | null;
  validUntil: Date | null;
  integrityStatus: string;
  integrityUnavailable: boolean;
}
