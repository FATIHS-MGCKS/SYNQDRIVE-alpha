import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type { LongitudinalProfileMaterializationOutcome } from './longitudinal-profile-materialization.types';

export type LongitudinalProfileMaterializationMetricOutcome =
  | LongitudinalProfileMaterializationOutcome['outcome']
  | 'ERROR';

export function longitudinalProfileMaterializationMetricOutcome(
  outcome: LongitudinalProfileMaterializationOutcome,
): Exclude<LongitudinalProfileMaterializationMetricOutcome, 'ERROR'> {
  return outcome.outcome;
}

export function recordLongitudinalProfileMaterializationObserved(
  metrics: TripMetricsService | undefined,
  input: {
    outcome: LongitudinalProfileMaterializationMetricOutcome;
    durationSeconds: number;
  },
): void {
  if (!metrics) return;
  const labels = { outcome: input.outcome };
  metrics.batteryLongitudinalProfileMaterializationAttemptsTotal.inc(labels);
  metrics.batteryLongitudinalProfileMaterializationDurationSeconds.observe(
    labels,
    input.durationSeconds,
  );
}
