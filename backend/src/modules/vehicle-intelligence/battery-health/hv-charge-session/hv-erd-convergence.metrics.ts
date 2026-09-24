import type { TripMetricsService } from '@modules/observability/trip-metrics.service';

export type ErdE3ConvergenceMetricReason =
  | 'fallback_detected'
  | 'fallback_rejected'
  | 'fallback_created'
  | 'fallback_updated'
  | 'match_same'
  | 'match_different'
  | 'match_ambiguous'
  | 'native_superseded_fallback'
  | 'convergence_failed';

export function recordErdE3ConvergenceMetric(
  metrics: TripMetricsService,
  reason: ErdE3ConvergenceMetricReason,
  increment = 1,
): void {
  if (increment <= 0) return;
  metrics.erdE3ConvergenceTotal.inc({ reason }, increment);
}
