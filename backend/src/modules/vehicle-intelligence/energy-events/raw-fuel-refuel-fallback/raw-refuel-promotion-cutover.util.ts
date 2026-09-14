import type { RawRefuelCandidate } from '@prisma/client';

/** Physical evidence end — same semantics as promotion draft mapper / F5.0 cutover boundary. */
export function resolveCandidatePhysicalEvidenceEnd(candidate: RawRefuelCandidate): Date {
  return (
    candidate.riseEndAt ??
    candidate.physicalEvidenceEnd ??
    (candidate.postFuelAbsoluteLiters != null ||
    candidate.postFuelRelativePercent != null
      ? candidate.lastObservedAt
      : candidate.firstObservedAt)
  );
}

export interface RawRefuelPromotionCutoverEvaluation {
  eligible: boolean;
  detail: string;
  evidenceEnd: Date;
  cutoverAt: Date | null;
}

/**
 * Promotion requires physical evidence end >= cutoverAt.
 * Unset/invalid cutover under an enabled promotion path => fail closed.
 */
export function evaluateRawRefuelPromotionCutover(
  candidate: RawRefuelCandidate,
  cutoverAt: Date | null,
): RawRefuelPromotionCutoverEvaluation {
  const evidenceEnd = resolveCandidatePhysicalEvidenceEnd(candidate);
  if (cutoverAt == null || Number.isNaN(cutoverAt.getTime())) {
    return {
      eligible: false,
      detail: 'cutover_unset_or_invalid',
      evidenceEnd,
      cutoverAt,
    };
  }
  if (evidenceEnd.getTime() < cutoverAt.getTime()) {
    return {
      eligible: false,
      detail: 'evidence_before_cutover',
      evidenceEnd,
      cutoverAt,
    };
  }
  return {
    eligible: true,
    detail: 'cutover_satisfied',
    evidenceEnd,
    cutoverAt,
  };
}
