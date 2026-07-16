import type { MisuseCaseDecisionEligibility, MisuseCaseStatus } from '@prisma/client';
import type { LifecycleTransitionResult } from '../misuse-case-lifecycle/misuse-case-lifecycle.types';
import type { CaseCandidate } from '../misuse-case.types';
import { resolveAttributionConfidence } from '../misuse-case-lifecycle/misuse-case-lifecycle.transition';
import { recalculateMisuseCaseEvidenceCounts } from '../misuse-case-evidence-count/misuse-case-evidence-count';
import { inferCoverageQuality } from '../misuse-case-rating-reconciliation/misuse-case-rating-reconciliation';
import {
  assessMisuseCategoryEvidenceStrength,
  buildCategoryEvidenceStrengthSummary,
  hasDataQualityIssueInSummary,
  inferCoverageFromCandidateSummary,
  isDataIntegrityMisuseCaseType,
} from './misuse-case-category-evidence-strength';
import type { MisuseCategoryEvidenceAssessment } from './misuse-case-category-evidence-strength.types';

const STATUS_RANK: Record<MisuseCaseStatus, number> = {
  NOT_ASSESSABLE: 0,
  SUPERSEDED: 0,
  DISMISSED: 0,
  RESOLVED: 0,
  CANDIDATE: 1,
  REVIEW_REQUIRED: 2,
  ACTIVE: 3,
  CONFIRMED: 4,
};

const ELIGIBILITY_RANK: Record<MisuseCaseDecisionEligibility, number> = {
  NOT_ELIGIBLE: 0,
  INFORMATIONAL_ONLY: 1,
  REVIEW_ONLY: 2,
  MANUAL_CONFIRMATION_ONLY: 3,
  OPERATIONAL_ELIGIBLE: 4,
};

export type GatedMisuseCandidate = {
  candidate: CaseCandidate;
  categoryAssessment: MisuseCategoryEvidenceAssessment;
};

export function assessCandidateCategoryEvidenceStrength(
  candidate: CaseCandidate,
  attribution: {
    attributionScope: ReturnType<typeof import('../misuse-case.types').resolveAttribution>['attributionScope'];
    assignmentStatusSnapshot: ReturnType<typeof import('../misuse-case.types').resolveAttribution>['assignmentStatusSnapshot'];
    isPrivateTripSnapshot: boolean;
  },
): MisuseCategoryEvidenceAssessment {
  const recalc = recalculateMisuseCaseEvidenceCounts(candidate.evidence);
  const attributionConfidence = resolveAttributionConfidence({
    attributionScope: attribution.attributionScope,
    assignmentStatus: attribution.assignmentStatusSnapshot,
    isPrivateTrip: attribution.isPrivateTripSnapshot,
  });

  const summaryCoverage = inferCoverageFromCandidateSummary(candidate.evidenceSummary);
  const inferredCoverage = inferCoverageQuality(recalc.qualifiedEvidence);
  const coverageQuality =
    summaryCoverage === 'NONE'
      ? 'NONE'
      : inferredCoverage === 'GOOD' || summaryCoverage === 'GOOD'
        ? 'GOOD'
        : 'SPARSE';

  return assessMisuseCategoryEvidenceStrength({
    caseType: candidate.type,
    qualifiedEvidence: recalc.qualifiedEvidence,
    repetitionCount: recalc.eventCount,
    coverageQuality,
    attributionConfidence,
    attributionScope: attribution.attributionScope,
    dataQualityIssue: hasDataQualityIssueInSummary(candidate.evidenceSummary),
  });
}

export function gateMisuseCandidatesByCategoryEvidenceStrength(
  candidates: CaseCandidate[],
  attribution: {
    attributionScope: ReturnType<typeof import('../misuse-case.types').resolveAttribution>['attributionScope'];
    assignmentStatusSnapshot: ReturnType<typeof import('../misuse-case.types').resolveAttribution>['assignmentStatusSnapshot'];
    isPrivateTripSnapshot: boolean;
  },
): GatedMisuseCandidate[] {
  const gated: GatedMisuseCandidate[] = [];

  for (const candidate of candidates) {
    if (isDataIntegrityMisuseCaseType(candidate.type)) {
      continue;
    }

    const categoryAssessment = assessCandidateCategoryEvidenceStrength(candidate, attribution);
    if (!categoryAssessment.passes) {
      continue;
    }

    gated.push({
      candidate: {
        ...candidate,
        evidenceSummary: {
          ...(candidate.evidenceSummary ?? {}),
          ...buildCategoryEvidenceStrengthSummary(categoryAssessment),
        },
      },
      categoryAssessment,
    });
  }

  return gated;
}

export function applyCategoryEffectCaps(
  lifecycle: LifecycleTransitionResult,
  assessment: MisuseCategoryEvidenceAssessment,
): LifecycleTransitionResult {
  if (!assessment.profile || !assessment.passes) {
    return lifecycle;
  }

  let status = lifecycle.status;
  if ((STATUS_RANK[status] ?? 0) > (STATUS_RANK[assessment.maxStatus] ?? 0)) {
    status = assessment.maxStatus;
  }

  let decisionEligibility = lifecycle.decisionEligibility;
  if (
    (ELIGIBILITY_RANK[decisionEligibility] ?? 0) >
    (ELIGIBILITY_RANK[assessment.maxDecisionEligibility] ?? 0)
  ) {
    decisionEligibility = assessment.maxDecisionEligibility;
  }

  return {
    ...lifecycle,
    status,
    decisionEligibility,
    informationalOnly: decisionEligibility !== 'OPERATIONAL_ELIGIBLE',
  };
}
