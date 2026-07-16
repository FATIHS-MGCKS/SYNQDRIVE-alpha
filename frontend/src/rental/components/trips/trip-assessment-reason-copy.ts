import type { TripAssessmentReasonCategory } from '../../../lib/api';

/** Short operator-facing labels for PRUEFHINWEIS reason categories. */
export const TRIP_ASSESSMENT_REASON_CATEGORY_LABEL: Record<TripAssessmentReasonCategory, string> = {
  DATA_QUALITY_REVIEW: 'Datenqualität prüfen',
  DRIVER_CONDUCT_REVIEW: 'Fahrverhalten prüfen',
  VEHICLE_LOAD_REVIEW: 'Fahrzeugbelastung prüfen',
  MISUSE_REVIEW: 'Fehlgebrauch prüfen',
  DAMAGE_INSPECTION: 'Schaden prüfen',
  ATTRIBUTION_REVIEW: 'Zuordnung prüfen',
};

export function formatTripAssessmentReviewHint(
  reasonCategory: TripAssessmentReasonCategory | null | undefined,
  primaryReason: string | null | undefined,
): string | null {
  if (!primaryReason) return null;
  if (!reasonCategory) return primaryReason;
  const categoryLabel = TRIP_ASSESSMENT_REASON_CATEGORY_LABEL[reasonCategory];
  return `${categoryLabel}: ${primaryReason}`;
}
