import type { TripMetricsService } from '@modules/observability/trip-metrics.service';

export type TripRouteV2MatchOutcome =
  | 'attempted'
  | 'succeeded'
  | 'fallback_filtered'
  | 'retryable_failure'
  | 'quality_rejected'
  | 'skipped';

export function recordTripRouteV2MatchAttempt(metrics: TripMetricsService): void {
  metrics.tripRouteV2MatchAttempted.inc();
}

export function recordTripRouteV2MatchOutcome(
  metrics: TripMetricsService,
  outcome: TripRouteV2MatchOutcome,
): void {
  switch (outcome) {
    case 'succeeded':
      metrics.tripRouteV2MatchSucceeded.inc();
      break;
    case 'fallback_filtered':
      metrics.tripRouteV2MatchFallbackFiltered.inc();
      break;
    case 'retryable_failure':
      metrics.tripRouteV2MatchRetryableFailure.inc();
      break;
    case 'quality_rejected':
      metrics.tripRouteV2MatchQualityRejected.inc();
      break;
    default:
      break;
  }
}

export function recordTripRouteV2MatchChunks(
  metrics: TripMetricsService,
  input: { chunkCount: number; failedChunkCount: number },
): void {
  metrics.tripRouteV2MatchChunkCount.observe(input.chunkCount);
  metrics.tripRouteV2MatchFailedChunkCount.observe(input.failedChunkCount);
}

export function recordTripRouteV2MatchQuality(
  metrics: TripMetricsService,
  input: { coverage: number; confidence: number },
): void {
  metrics.tripRouteV2MatchCoverage.observe(input.coverage);
  metrics.tripRouteV2MatchConfidence.observe(input.confidence);
}

export function recordTripRouteV2MatchDuration(
  metrics: TripMetricsService,
  durationMs: number,
): void {
  metrics.tripRouteV2MatchDurationMs.observe(durationMs);
}
