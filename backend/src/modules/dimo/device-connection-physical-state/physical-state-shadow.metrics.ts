import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { DeviceConnectionPhysicalAuthorityMode } from '@prisma/client';
import { PhysicalStateShadowClassification } from './physical-state-shadow.classification';

export type ShadowMetricsDimensions = {
  classification: PhysicalStateShadowClassification | string;
  authority_mode: DeviceConnectionPhysicalAuthorityMode | string;
  provider: string;
  legacy_decision: 'accept' | 'reject';
  physical_decision: 'accept' | 'reject';
  correctness_blocking: 'true' | 'false';
};

export function recordPhysicalStateShadowEvaluation(
  metrics: TripMetricsService,
  input: ShadowMetricsDimensions,
): void {
  metrics.connectivityPhysicalStateShadowEvaluationTotal.inc(input);
}

export function recordPhysicalStateShadowClassification(
  metrics: TripMetricsService,
  input: ShadowMetricsDimensions,
): void {
  metrics.connectivityPhysicalStateShadowClassificationTotal.inc(input);
}

export function recordPhysicalStateShadowCorrectnessBlocker(
  metrics: TripMetricsService,
  input: ShadowMetricsDimensions,
): void {
  metrics.connectivityPhysicalStateShadowCorrectnessBlockerTotal.inc(input);
}

export function recordPhysicalStateShadowObservationPersistenceFailure(
  metrics: TripMetricsService,
  input: { provider: string },
): void {
  metrics.connectivityPhysicalStateShadowObservationPersistenceFailureTotal.inc(input);
}
