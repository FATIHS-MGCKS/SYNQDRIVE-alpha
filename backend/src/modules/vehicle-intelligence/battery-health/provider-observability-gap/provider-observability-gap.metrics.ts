import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  classifyProviderGapFailureReason,
  isProviderGapFailureReason,
  mapProviderGapSemanticFailureReason,
  type ProviderGapFailureReason,
} from './provider-observability-gap-failure-reason';

export function recordProviderGapOpened(metrics: TripMetricsService | undefined): void {
  metrics?.batteryProviderObservabilityGapOpenedTotal.inc();
}

export function recordProviderGapExtended(metrics: TripMetricsService | undefined): void {
  metrics?.batteryProviderObservabilityGapExtendedTotal.inc();
}

function normalizeFailureReason(reason: string): ProviderGapFailureReason {
  if (isProviderGapFailureReason(reason)) {
    return reason;
  }
  return mapProviderGapSemanticFailureReason(reason);
}

export function recordProviderGapLifecycleFailure(
  metrics: TripMetricsService | undefined,
  operation: 'entry' | 'resolution',
  reason: string,
): void {
  metrics?.batteryProviderObservabilityGapFailureTotal.inc({
    operation,
    reason: normalizeFailureReason(reason),
  });
}

export function recordProviderGapLifecycleFailureFromError(
  metrics: TripMetricsService | undefined,
  operation: 'entry' | 'resolution',
  err: unknown,
): void {
  recordProviderGapLifecycleFailure(
    metrics,
    operation,
    classifyProviderGapFailureReason(err),
  );
}
