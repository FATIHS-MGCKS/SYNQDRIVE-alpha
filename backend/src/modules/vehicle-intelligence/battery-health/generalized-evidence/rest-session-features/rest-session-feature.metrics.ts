import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type {
  RestSessionFeatureShadowTriggerReason,
  RestSessionFeatureShadowTriggerOutcome,
} from './rest-session-feature-shadow-trigger.types';

export type RestSessionFeatureTriggerMetricOutcome = Exclude<
  RestSessionFeatureShadowTriggerOutcome['status'],
  'FAILED_ISOLATED'
> &
  ('FAILED_ISOLATED' | RestSessionFeatureShadowTriggerOutcome['status']);

export function restSessionFeatureTriggerMetricOutcome(
  outcome: RestSessionFeatureShadowTriggerOutcome,
): RestSessionFeatureShadowTriggerOutcome['status'] {
  return outcome.status;
}

export function recordRestSessionFeatureTriggerObserved(
  metrics: TripMetricsService | undefined,
  input: {
    reason: RestSessionFeatureShadowTriggerReason;
    outcome: RestSessionFeatureShadowTriggerOutcome['status'];
    durationSeconds: number;
  },
): void {
  if (!metrics) return;
  const labels = { reason: input.reason, outcome: input.outcome };
  metrics.batteryRestSessionFeatureTriggerTotal.inc(labels);
  metrics.batteryRestSessionFeatureTriggerDurationSeconds.observe(labels, input.durationSeconds);
}

export function recordRestSessionFeatureRowCreated(
  metrics: TripMetricsService | undefined,
  input: {
    phase: 'INCREMENTAL' | 'FINAL';
    trust: 'VALID' | 'INVALIDATED';
  },
): void {
  metrics?.batteryRestSessionFeatureRowCreatedTotal.inc({
    phase: input.phase,
    trust: input.trust,
  });
}
