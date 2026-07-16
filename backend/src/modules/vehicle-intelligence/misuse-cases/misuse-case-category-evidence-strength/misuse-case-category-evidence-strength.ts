/**
 * Per-category required evidence strength profiles (P51).
 */
import type { EvidenceCandidate } from '../misuse-case.types';
import { isProxyOnlyEvidence } from '../misuse-case-rating-reconciliation/misuse-case-rating-reconciliation';
import {
  MISUSE_CATEGORY_EVIDENCE_PROFILES,
  MISUSE_CATEGORY_EVIDENCE_STRENGTH_VERSION,
  PROFILED_MISUSE_CASE_TYPES,
  type AttributionRequirement,
  type CoverageRequirement,
  type MisuseCategoryEvidenceProfile,
} from './misuse-case-category-evidence-strength.config';
import type {
  MisuseCategoryEvidenceAssessment,
  MisuseCategoryEvidenceAssessmentInput,
  MisuseCategoryEvidenceRejectionReason,
  MisuseCategoryMaturity,
} from './misuse-case-category-evidence-strength.types';

const COVERAGE_RANK: Record<CoverageRequirement, number> = {
  NONE: 0,
  SPARSE: 1,
  GOOD: 2,
};

const ATTRIBUTION_RANK: Record<AttributionRequirement, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

const ATTRIBUTION_CONFIDENCE_RANK: Record<string, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

const PROFILE_BY_CASE_TYPE = new Map(
  Object.values(MISUSE_CATEGORY_EVIDENCE_PROFILES).map((profile) => [profile.caseType, profile]),
);

export function getMisuseCategoryEvidenceProfile(
  caseType: MisuseCategoryEvidenceProfile['caseType'],
): MisuseCategoryEvidenceProfile | null {
  return PROFILE_BY_CASE_TYPE.get(caseType) ?? null;
}

export function isProfiledMisuseCaseType(caseType: MisuseCategoryEvidenceProfile['caseType']): boolean {
  return PROFILED_MISUSE_CASE_TYPES.has(caseType);
}

export function resolveCategoryMaturity(
  profile: MisuseCategoryEvidenceProfile,
  qualifiedEvidence: EvidenceCandidate[],
  forceShadow = false,
): MisuseCategoryMaturity {
  if (forceShadow) return 'SHADOW';

  const shadowSources = new Set(profile.normalization.shadowSourceTypes);
  const hasPublishedSource = qualifiedEvidence.some(
    (item) => !shadowSources.has(item.sourceType),
  );
  const onlyShadowSources =
    qualifiedEvidence.length > 0 &&
    qualifiedEvidence.every((item) => shadowSources.has(item.sourceType));

  if (onlyShadowSources && !hasPublishedSource) {
    return 'SHADOW';
  }

  return 'PUBLISHED';
}

function meetsCoverage(
  actual: CoverageRequirement,
  required: CoverageRequirement,
): boolean {
  return COVERAGE_RANK[actual] >= COVERAGE_RANK[required];
}

function meetsAttribution(
  actual: MisuseCategoryEvidenceAssessmentInput['attributionConfidence'],
  required: AttributionRequirement,
): boolean {
  return (
    (ATTRIBUTION_CONFIDENCE_RANK[actual] ?? 0) >= (ATTRIBUTION_RANK[required] ?? 0)
  );
}

function hasDisallowedSources(
  profile: MisuseCategoryEvidenceProfile,
  qualifiedEvidence: EvidenceCandidate[],
): boolean {
  const allowed = new Set(profile.allowedSourceTypes);
  return qualifiedEvidence.some((item) => !allowed.has(item.sourceType));
}

/**
 * Assess whether a candidate meets the category-specific evidence strength profile.
 */
export function assessMisuseCategoryEvidenceStrength(
  input: MisuseCategoryEvidenceAssessmentInput,
): MisuseCategoryEvidenceAssessment {
  const profile = getMisuseCategoryEvidenceProfile(input.caseType);
  if (!profile) {
    return {
      profileKey: null,
      profile: null,
      passes: true,
      rejectionReasons: [],
      maturity: 'PUBLISHED',
      effectCaps: {
        maxStatus: 'REVIEW_REQUIRED',
        maxDecisionEligibility: 'MANUAL_CONFIRMATION_ONLY',
        healthEligibility: 'INFORMATIONAL',
        customerEligibility: 'MANUAL_CONFIRMATION_ONLY',
      },
      healthEligibility: 'INFORMATIONAL',
      customerEligibility: 'MANUAL_CONFIRMATION_ONLY',
      maxStatus: 'REVIEW_REQUIRED',
      maxDecisionEligibility: 'MANUAL_CONFIRMATION_ONLY',
      allowedSourceTypes: [],
      modelVersion: MISUSE_CATEGORY_EVIDENCE_STRENGTH_VERSION,
    };
  }

  const rejectionReasons: MisuseCategoryEvidenceRejectionReason[] = [];

  if (input.dataQualityIssue && profile.normalization.rejectOnDataQualityIssue) {
    rejectionReasons.push('DATA_QUALITY_ISSUE');
  }

  if (!meetsCoverage(input.coverageQuality, profile.minCoverage)) {
    rejectionReasons.push('INSUFFICIENT_COVERAGE');
  }

  if (!meetsAttribution(input.attributionConfidence, profile.minAttribution)) {
    rejectionReasons.push('INSUFFICIENT_ATTRIBUTION');
  }

  if (!profile.minAttributionScopes.includes(input.attributionScope)) {
    rejectionReasons.push('ATTRIBUTION_SCOPE_BLOCKED');
  }

  if (input.repetitionCount < profile.minRepetition) {
    rejectionReasons.push('INSUFFICIENT_REPETITION');
  }

  if (hasDisallowedSources(profile, input.qualifiedEvidence)) {
    rejectionReasons.push('DISALLOWED_SOURCE_TYPE');
  }

  if (
    profile.normalization.proxyOnlyInsufficient &&
    isProxyOnlyEvidence(input.qualifiedEvidence)
  ) {
    rejectionReasons.push('PROXY_ONLY_INSUFFICIENT');
  }

  const maturity = resolveCategoryMaturity(
    profile,
    input.qualifiedEvidence,
    input.forceShadow,
  );
  const effectCaps =
    maturity === 'SHADOW' ? profile.shadowEffect : profile.publishedEffect;

  return {
    profileKey: profile.key,
    profile,
    passes: rejectionReasons.length === 0,
    rejectionReasons,
    maturity,
    effectCaps,
    healthEligibility: effectCaps.healthEligibility,
    customerEligibility: effectCaps.customerEligibility,
    maxStatus: effectCaps.maxStatus,
    maxDecisionEligibility: effectCaps.maxDecisionEligibility,
    allowedSourceTypes: [...profile.allowedSourceTypes],
    modelVersion: MISUSE_CATEGORY_EVIDENCE_STRENGTH_VERSION,
  };
}

export function buildCategoryEvidenceStrengthSummary(
  assessment: MisuseCategoryEvidenceAssessment,
): Record<string, unknown> {
  if (!assessment.profile) {
    return {
      categoryEvidenceStrength: {
        modelVersion: assessment.modelVersion,
        profiled: false,
      },
    };
  }

  return {
    categoryEvidenceStrength: {
      modelVersion: assessment.modelVersion,
      profiled: true,
      profileKey: assessment.profileKey,
      caseType: assessment.profile.caseType,
      maturity: assessment.maturity,
      passes: assessment.passes,
      rejectionReasons: assessment.rejectionReasons,
      allowedSourceTypes: assessment.allowedSourceTypes,
      minCoverage: assessment.profile.minCoverage,
      minAttribution: assessment.profile.minAttribution,
      minRepetition: assessment.profile.minRepetition,
      healthEligibility: assessment.healthEligibility,
      customerEligibility: assessment.customerEligibility,
      maxStatus: assessment.maxStatus,
      maxDecisionEligibility: assessment.maxDecisionEligibility,
    },
  };
}

/** Data integrity case types must never be emitted as customer-facing misuse. */
export function isDataIntegrityMisuseCaseType(
  caseType: MisuseCategoryEvidenceProfile['caseType'],
): boolean {
  return caseType === 'TELEMETRY_INTEGRITY_ISSUE' || caseType === 'TAMPERING_SUSPECTED';
}

/** Proxy evidence alone can never produce confirmed misuse eligibility. */
export function blocksConfirmedMisuseFromProxy(
  qualifiedEvidence: EvidenceCandidate[],
): boolean {
  return isProxyOnlyEvidence(qualifiedEvidence);
}

export function inferCoverageFromCandidateSummary(
  evidenceSummary?: Record<string, unknown> | null,
): CoverageRequirement {
  const context = evidenceSummary?.contextEvidence as
    | { evidenceGrade?: string; confidence?: string; dataQuality?: { sampleCount?: number } }
    | undefined;
  if (!context) return 'SPARSE';

  if (context.evidenceGrade === 'A' || context.evidenceGrade === 'B') return 'GOOD';
  if (context.confidence === 'LOW' || context.confidence === 'INSUFFICIENT') return 'NONE';
  if ((context.dataQuality?.sampleCount ?? 0) > 0 && (context.dataQuality?.sampleCount ?? 0) < 3) {
    return 'NONE';
  }
  return 'SPARSE';
}

export function hasDataQualityIssueInSummary(
  evidenceSummary?: Record<string, unknown> | null,
): boolean {
  const context = evidenceSummary?.contextEvidence as
    | { confidence?: string; reasonCodes?: string[] }
    | undefined;
  if (!context) return false;
  if (context.confidence === 'INSUFFICIENT') return true;
  return (context.reasonCodes ?? []).some((code) =>
    /INSUFFICIENT|MISSING|STALE|DATA_QUALITY|NOT_ASSESSABLE/i.test(code),
  );
}
