import { TripMetricsService } from '@modules/observability/trip-metrics.service';

export type PreseedMetricDimensions = {
  result: string;
  provider: string;
  dry_run: string;
};

export function recordPhysicalStatePreseedResult(
  metrics: TripMetricsService,
  input: PreseedMetricDimensions,
): void {
  metrics.connectivityPhysicalStatePreseedTotal.inc(input);
}
