/**
 * D4 default-observation denominator only — provisional/excluded sessions are not mixed into this percent.
 */
export function computeDefaultEligibleObservationPercent(
  eligibleDefaultObservationCount: number,
  defaultObservationTotal: number,
): number | null {
  if (defaultObservationTotal <= 0) return null;
  return (100 * eligibleDefaultObservationCount) / defaultObservationTotal;
}
