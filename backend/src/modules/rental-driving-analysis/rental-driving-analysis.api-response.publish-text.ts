/**
 * Explicit allow/deny for score-derived rental stress copy in outbound API payloads (F6).
 * Matches strings produced in RentalDrivingAnalysisService.buildPayload watchpoints/recommendations.
 */

const SCORE_DERIVED_WATCHPOINT_PATTERNS: RegExp[] = [
  /^elevated vehicle stress \(\d+\)/i,
  /^high braking stress/i,
  /^high longitudinal\/drivetrain stress/i,
  /^elevated braking stress —/i,
  /^high overall vehicle stress —/i,
];

const SCORE_DERIVED_RECOMMENDATION_PATTERNS: RegExp[] = [
  /^inspect brake condition after this rental/i,
  /^review tire wear — high overall vehicle stress/i,
];

export function isScoreDerivedRentalWatchpointText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return SCORE_DERIVED_WATCHPOINT_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isScoreDerivedRentalRecommendationText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return SCORE_DERIVED_RECOMMENDATION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function filterScoreDerivedWatchpointTexts(lines: string[] | undefined): string[] {
  if (!lines?.length) return lines ?? [];
  return lines.filter((line) => !isScoreDerivedRentalWatchpointText(line));
}

export function filterScoreDerivedRecommendationTexts(lines: string[] | undefined): string[] {
  if (!lines?.length) return lines ?? [];
  return lines.filter((line) => !isScoreDerivedRentalRecommendationText(line));
}