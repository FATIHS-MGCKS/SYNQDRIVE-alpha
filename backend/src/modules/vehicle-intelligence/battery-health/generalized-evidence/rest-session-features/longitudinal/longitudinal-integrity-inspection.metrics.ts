import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type { D4IntegrityQualifiedDisposition } from './longitudinal-integrity-inspection.types';

/** M3.3F F1 — D4 metric helpers only; no automatic D4 runtime invocation in F1. */
export function recordLongitudinalProfileIntegrityInspectionObserved(
  metrics: TripMetricsService | undefined,
  input: { disposition: D4IntegrityQualifiedDisposition },
): void {
  metrics?.batteryLongitudinalProfileIntegrityInspectionTotal.inc({
    disposition: input.disposition,
  });
}

export function recordLongitudinalProfileSelfIntegrityFailureObserved(
  metrics: TripMetricsService | undefined,
): void {
  metrics?.batteryLongitudinalProfileSelfIntegrityFailureTotal.inc();
}
