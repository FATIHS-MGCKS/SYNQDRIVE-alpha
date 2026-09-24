import type { TripMetricsService } from '@modules/observability/trip-metrics.service';

export type ErdLivenessMetricReason =
  | 'reconcile_target_selected'
  | 'reconcile_enqueued'
  | 'reconcile_duplicate_suppressed'
  | 'reconcile_retry'
  | 'reconcile_dlq'
  | 'reconcile_recovered_after_failure'
  | 'reconcile_skipped_disabled'
  | 'reconcile_skipped_insufficient_capability'
  | 'reconcile_skipped_dead_letter'
  | 'authority_lock_contention';

export function recordErdLivenessMetric(
  metrics: TripMetricsService | undefined,
  reason: ErdLivenessMetricReason,
  count = 1,
): void {
  if (!metrics?.erdE4LivenessTotal) return;
  if (count <= 0) return;
  metrics.erdE4LivenessTotal.inc({ reason }, count);
}
