import type { TripAssessmentInput, TripAssessmentReasonCategory, TripAssessmentStatus } from './trip-assessment.types';
import { EVIDENCE_LEVEL_RANK } from './trip-evidence-level.types';

/** Resolve the additive PRUEFHINWEIS reason category (null for non-review statuses). */
export function resolveTripAssessmentReasonCategory(
  input: TripAssessmentInput,
  status: TripAssessmentStatus,
  abuseRelevantCount: number,
): TripAssessmentReasonCategory | null {
  if (status !== 'PRUEFHINWEIS') return null;

  if (input.deviceQualityDegraded) {
    return 'DATA_QUALITY_REVIEW';
  }

  if (input.maxEvidenceLevel === 'DAMAGE_RISK') {
    return 'DAMAGE_INSPECTION';
  }

  if (input.misuseCaseCount > 0 || input.maxEvidenceLevel === 'MISUSE_SUSPECTED') {
    return 'MISUSE_REVIEW';
  }

  const hasAbuseCategoryEvent = input.unifiedEvents.some(
    (event) => event.eventCategory === 'ABUSE' && event.abuseRelevant,
  );
  if (hasAbuseCategoryEvent) {
    return 'MISUSE_REVIEW';
  }

  if (input.vehicleLoadNeedsReview) {
    return 'VEHICLE_LOAD_REVIEW';
  }

  if (input.attributionNeedsReview) {
    return 'ATTRIBUTION_REVIEW';
  }

  if (
    abuseRelevantCount > 0 ||
    (input.maxEvidenceLevel != null &&
      EVIDENCE_LEVEL_RANK[input.maxEvidenceLevel] >= EVIDENCE_LEVEL_RANK.CHECK_RECOMMENDED)
  ) {
    return 'DRIVER_CONDUCT_REVIEW';
  }

  return 'DRIVER_CONDUCT_REVIEW';
}
