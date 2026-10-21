import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type { M3_3HvH4A3ReconciliationTickOutcomeV1 } from './m3-3-hv-h4-a3-reconciliation.types.v1';
import type { M3_3HvH4A3ReconciliationSchedulerTickResultV1 } from './m3-3-hv-h4-a3-reconciliation.types.v1';

export function recordM3_3HvH4A3ReconciliationSchedulerTick(
  metrics: TripMetricsService | undefined,
  result: M3_3HvH4A3ReconciliationSchedulerTickResultV1,
  durationSeconds?: number,
): void {
  if (!metrics?.batteryHvH4A3ReconciliationSchedulerTicksTotal) return;
  metrics.batteryHvH4A3ReconciliationSchedulerTicksTotal.inc({
    result,
  });
  if (durationSeconds != null && metrics.batteryHvH4A3ReconciliationSchedulerDurationSeconds) {
    metrics.batteryHvH4A3ReconciliationSchedulerDurationSeconds.observe(durationSeconds);
  }
}

export function recordM3_3HvH4A3ReconciliationTick(
  metrics: TripMetricsService | undefined,
  outcome: M3_3HvH4A3ReconciliationTickOutcomeV1,
): void {
  if (!metrics?.batteryHvH4A3ReconciliationInspectedTotal) return;
  metrics.batteryHvH4A3ReconciliationInspectedTotal.inc(outcome.inspectedCount);
  metrics.batteryHvH4A3ReconciliationCreatedTotal?.inc(outcome.createdCount);
  metrics.batteryHvH4A3ReconciliationExistingTotal?.inc(outcome.existingCount);
}
