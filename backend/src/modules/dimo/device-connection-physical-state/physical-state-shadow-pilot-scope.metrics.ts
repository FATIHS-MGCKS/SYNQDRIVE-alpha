import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type { ShadowPilotScopeGateReason } from './physical-state-shadow-pilot-scope.types';

export type ShadowPilotGateMetricDimensions = {
  allowed: 'true' | 'false';
  reason: ShadowPilotScopeGateReason;
  provider: string;
};

export function recordShadowPilotScopeGateDecision(
  metrics: TripMetricsService,
  input: ShadowPilotGateMetricDimensions,
): void {
  metrics.connectivityPhysicalStateShadowPilotScopeGateTotal.inc(input);
}
