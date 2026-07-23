import { DOCUMENT_TYPE, LEGAL_DOCUMENT_TYPES } from './documents.constants';
import {
  LEGAL_DOCUMENT_RESOLVER_ERROR_CODES,
  LEGAL_DOCUMENT_RESOLVER_SELECTION_REASON,
  LEGAL_DOCUMENT_RESOLVER_VERSION,
} from './legal-document-resolver.constants';
import type {
  LegalDocumentEvaluatedContext,
  LegalDocumentFallbackDecision,
  LegalDocumentMissingMandatory,
  LegalDocumentResolverCandidate,
  LegalDocumentResolverConflict,
  LegalDocumentResolverError,
  LegalDocumentResolverResult,
  LegalDocumentSelection,
} from './legal-document-resolver.types';
import {
  buildSelection,
  detectResolverConflicts,
  documentMatchesContext,
  selectBestCandidate,
} from './legal-document-resolver.matching';
import { LEGAL_STATION_SCOPE_MODE } from './legal-document-scope.constants';

export interface ResolveLegalDocumentsEngineInput {
  context: LegalDocumentEvaluatedContext;
  candidates: LegalDocumentResolverCandidate[];
  documentTypes?: string[] | null;
  fallbackDecisions?: LegalDocumentFallbackDecision[];
  contextErrors?: LegalDocumentResolverError[];
}

/**
 * Pure resolution engine — deterministic, no database access, no findFirst.
 */
export function resolveLegalDocuments(
  input: ResolveLegalDocumentsEngineInput,
): LegalDocumentResolverResult {
  const evaluatedAt = new Date().toISOString();
  const at = new Date(input.context.effectiveTimestamp);
  const fallbackDecisions = [...(input.fallbackDecisions ?? [])];
  const errors: LegalDocumentResolverError[] = [...(input.contextErrors ?? [])];
  const selectedDocuments: LegalDocumentSelection[] = [];
  const missingMandatoryDocuments: LegalDocumentMissingMandatory[] = [];
  const conflicts: LegalDocumentResolverConflict[] = [];

  if (!input.context.customerLanguage) {
    return finalizeResult({
      evaluatedAt,
      context: input.context,
      selectedDocuments,
      missingMandatoryDocuments,
      conflicts,
      fallbackDecisions,
      errors,
    });
  }

  const types = input.documentTypes?.length
    ? input.documentTypes
    : [...LEGAL_DOCUMENT_TYPES];

  for (const documentType of types) {
    const typeCandidates = input.candidates.filter((c) => c.documentType === documentType);
    const matching = typeCandidates.filter(
      (c) => documentMatchesContext(c, input.context, at).matches,
    );

    const orgWideFallback = tryOrganizationWideFallback(
      documentType,
      typeCandidates,
      input.context,
      at,
      matching,
      fallbackDecisions,
    );
    const effectiveMatching = orgWideFallback.matches;

    const typeConflicts = detectResolverConflicts(effectiveMatching, documentType);
    if (typeConflicts.length > 0) {
      conflicts.push(...typeConflicts);
      errors.push({
        code: LEGAL_DOCUMENT_RESOLVER_ERROR_CODES.SCOPE_CONFLICT,
        message: `Ambiguous legal document rules for ${documentType}`,
        documentType,
      });
      continue;
    }

    const winner = selectBestCandidate(effectiveMatching);
    if (winner) {
      const reason =
        effectiveMatching.length === 1
          ? LEGAL_DOCUMENT_RESOLVER_SELECTION_REASON.SINGLE_MATCH
          : orgWideFallback.used
            ? LEGAL_DOCUMENT_RESOLVER_SELECTION_REASON.ORGANIZATION_WIDE_FALLBACK
            : LEGAL_DOCUMENT_RESOLVER_SELECTION_REASON.HIGHEST_PRIORITY_MATCH;
      selectedDocuments.push(buildSelection(winner, effectiveMatching.length, reason));
      continue;
    }

    const mandatory = inferMandatoryForType(typeCandidates, documentType);
    if (mandatory) {
      const reason = inferMissingReason(typeCandidates, input.context, at);
      missingMandatoryDocuments.push({
        documentType,
        isMandatory: true,
        reason,
        code: LEGAL_DOCUMENT_RESOLVER_ERROR_CODES.MISSING_MANDATORY,
      });
      if (reason.includes('jurisdiction')) {
        errors.push({
          code: LEGAL_DOCUMENT_RESOLVER_ERROR_CODES.UNSUPPORTED_JURISDICTION,
          message: `No legal document for jurisdiction ${input.context.jurisdiction} and type ${documentType}`,
          documentType,
          field: 'jurisdiction',
        });
      }
    }
  }

  return finalizeResult({
    evaluatedAt,
    context: input.context,
    selectedDocuments,
    missingMandatoryDocuments,
    conflicts,
    fallbackDecisions,
    errors,
  });
}

function tryOrganizationWideFallback(
  documentType: string,
  typeCandidates: LegalDocumentResolverCandidate[],
  context: LegalDocumentEvaluatedContext,
  at: Date,
  initialMatches: LegalDocumentResolverCandidate[],
  fallbackDecisions: LegalDocumentFallbackDecision[],
): { matches: LegalDocumentResolverCandidate[]; used: boolean } {
  if (initialMatches.length > 0 || !context.stationId) {
    return { matches: initialMatches, used: false };
  }

  const orgWideContext: LegalDocumentEvaluatedContext = {
    ...context,
    stationId: null,
  };
  const orgWideMatches = typeCandidates.filter(
    (c) =>
      c.stationScopeMode === LEGAL_STATION_SCOPE_MODE.ORGANIZATION_WIDE &&
      documentMatchesContext(c, orgWideContext, at).matches,
  );

  if (orgWideMatches.length > 0) {
    fallbackDecisions.push({
      field: 'stationId',
      source: 'ORGANIZATION_WIDE_FALLBACK',
      value: documentType,
      message: `No station-specific rule for ${documentType}; using organization-wide document.`,
    });
  }

  return { matches: orgWideMatches, used: orgWideMatches.length > 0 };
}

function inferMandatoryForType(
  typeCandidates: LegalDocumentResolverCandidate[],
  documentType: string,
): boolean {
  const activeMandatory = typeCandidates.some((c) => c.isMandatory);
  if (activeMandatory) return true;
  return (
    documentType === DOCUMENT_TYPE.TERMS_AND_CONDITIONS ||
    documentType === DOCUMENT_TYPE.CONSUMER_INFORMATION ||
    documentType === DOCUMENT_TYPE.PRIVACY_POLICY
  );
}

function inferMissingReason(
  typeCandidates: LegalDocumentResolverCandidate[],
  context: LegalDocumentEvaluatedContext,
  at: Date,
): string {
  if (typeCandidates.length === 0) {
    return 'No legal document versions configured for this organization';
  }

  const hasLanguage = typeCandidates.some((c) => c.language === context.customerLanguage);
  if (!hasLanguage) {
    return `No legal document for language ${context.customerLanguage}`;
  }

  const hasJurisdiction = typeCandidates.some(
    (c) => c.jurisdictionCountry === context.jurisdiction,
  );
  if (!hasJurisdiction) {
    return `No legal document for jurisdiction ${context.jurisdiction}`;
  }

  const hasActive = typeCandidates.some((c) => c.status === 'ACTIVE');
  if (!hasActive) {
    return 'No ACTIVE legal document version available';
  }

  const hasValid = typeCandidates.some(
    (c) => c.status === 'ACTIVE' && documentMatchesContext(c, context, at).matches === false,
  );
  if (hasValid) {
    const expired = typeCandidates.some(
      (c) => c.validUntil && c.validUntil <= at,
    );
    if (expired) return 'Legal document version has expired';
    const future = typeCandidates.some(
      (c) => c.validFrom && c.validFrom > at,
    );
    if (future) return 'Legal document version is not yet valid';
    const revoked = typeCandidates.some((c) => c.status === 'REVOKED');
    if (revoked) return 'Legal document version was revoked';
  }

  return 'No matching legal document for the evaluated booking context';
}

function finalizeResult(parts: {
  evaluatedAt: string;
  context: LegalDocumentEvaluatedContext;
  selectedDocuments: LegalDocumentSelection[];
  missingMandatoryDocuments: LegalDocumentMissingMandatory[];
  conflicts: LegalDocumentResolverConflict[];
  fallbackDecisions: LegalDocumentFallbackDecision[];
  errors: LegalDocumentResolverError[];
}): LegalDocumentResolverResult {
  const blockingCodes = new Set<string>([
    LEGAL_DOCUMENT_RESOLVER_ERROR_CODES.MISSING_LANGUAGE,
    LEGAL_DOCUMENT_RESOLVER_ERROR_CODES.SCOPE_CONFLICT,
  ]);
  const hasBlockingErrors = parts.errors.some((e) => blockingCodes.has(e.code));
  const isComplete =
    Boolean(parts.context.customerLanguage) &&
    Boolean(parts.context.jurisdiction) &&
    !hasBlockingErrors &&
    parts.conflicts.length === 0 &&
    parts.missingMandatoryDocuments.length === 0;

  return {
    resolverVersion: LEGAL_DOCUMENT_RESOLVER_VERSION,
    evaluatedAt: parts.evaluatedAt,
    evaluatedContext: parts.context,
    selectedDocuments: parts.selectedDocuments,
    missingMandatoryDocuments: parts.missingMandatoryDocuments,
    conflicts: parts.conflicts,
    fallbackDecisions: parts.fallbackDecisions,
    errors: parts.errors,
    isComplete,
  };
}
