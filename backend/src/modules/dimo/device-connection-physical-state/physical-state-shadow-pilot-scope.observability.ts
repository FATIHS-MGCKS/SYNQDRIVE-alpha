import { Logger } from '@nestjs/common';
import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type { PhysicalAuthorityScopeIdentity, ShadowPilotScopeGateDecision } from './physical-state-shadow-pilot-scope.types';
import { recordShadowPilotScopeGateDecision } from './physical-state-shadow-pilot-scope.metrics';

const pilotGateLogger = new Logger('PhysicalStateShadowPilotScopeGate');

export function recordShadowPilotScopeGateObservability(
  metrics: TripMetricsService | undefined,
  scope: PhysicalAuthorityScopeIdentity,
  decision: ShadowPilotScopeGateDecision,
): void {
  pilotGateLogger.log({
    event: 'physical_state_shadow_pilot_scope_gate',
    organizationId: scope.organizationId,
    vehicleId: scope.vehicleId,
    provider: scope.provider,
    allowed: decision.allowed,
    reason: decision.reason,
  });

  metrics?.connectivityPhysicalStateShadowPilotScopeGateTotal.inc({
    allowed: decision.allowed ? 'true' : 'false',
    reason: decision.reason,
    provider: scope.provider,
  });
}
