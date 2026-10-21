import type { TripMetricsService } from '@modules/observability/trip-metrics.service';

export type EvidenceWriterMetricDimensions = {
  source: string;
  decision: string;
  mode: string;
};

export function recordPhysicalStateEvidenceWriterResult(
  metrics: TripMetricsService,
  input: EvidenceWriterMetricDimensions,
): void {
  metrics.connectivityPhysicalStateEvidenceWriterTotal.inc(input);
}

export function recordPhysicalStateStatefulShadowEvaluation(
  metrics: TripMetricsService,
  input: { mode: string },
): void {
  metrics.connectivityPhysicalStateStatefulShadowEvaluationTotal.inc(input);
}

export function recordPhysicalStateGtR1ExpectedFix(
  metrics: TripMetricsService,
  input: { source: string },
): void {
  metrics.connectivityPhysicalStateGtR1ExpectedFixTotal.inc(input);
}
