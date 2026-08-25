/**
 * Maps Rental Health V1 aggregate to P0.2 health evidence input.
 */
import type { VehicleHealth } from '../../../rental-health/rental-health.types';
import { RENTAL_HEALTH_MODULE_KEYS } from '../../../rental-health/rental-health.types';
import type { HealthEvidenceSnapshot } from './vehicle-operational-projection.types';

const TELEMETRY_DEPENDENT_MODULE_KEYS = new Set([
  'battery',
  'tires',
  'brakes',
  'error_codes',
  'vehicle_alerts',
]);

export function healthEvidenceFromVehicleHealth(
  health: VehicleHealth,
): HealthEvidenceSnapshot {
  const anyModuleDataStale = RENTAL_HEALTH_MODULE_KEYS.some(
    (key) => health.modules[key].data_stale,
  );
  const telemetryDependentModulesEvaluated = RENTAL_HEALTH_MODULE_KEYS.some(
    (key) =>
      TELEMETRY_DEPENDENT_MODULE_KEYS.has(key) &&
      health.modules[key].state !== 'n_a',
  );

  return {
    conditionState: health.overall_state,
    pipelineAvailability: health.availability,
    rentalBlocked: health.rental_blocked,
    generatedAt: health.generated_at ?? health.evaluated_at ?? null,
    anyModuleDataStale,
    telemetryDependentModulesEvaluated,
  };
}
