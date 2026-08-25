/**
 * P0.4 — Minimal Fleet consumer contract for Health condition + P0.2 evaluability.
 */
import type { HealthState } from '../../rental-health/rental-health.types';
import type {
  HealthEvaluabilityState,
  VehicleOperationalProjection,
} from './projection/vehicle-operational-projection.types';

export type FleetHealthConditionState = 'good' | 'warning' | 'critical' | 'unknown';

export interface FleetHealthEvaluationDto {
  /** Authoritative Rental Health condition severity when evidence exists. */
  condition: FleetHealthConditionState;
  /** P0.2 — whether the condition can be presented confidently. */
  evaluability: HealthEvaluabilityState;
  /** Rental Health pipeline coverage — passthrough for operator diagnostics. */
  pipelineAvailability: 'ready' | 'partial' | 'unavailable' | null;
  generatedAt: string;
  healthEvidenceAt: string | null;
  anyModuleDataStale: boolean | null;
  source: 'p0.2_projection';
}

const KNOWN_CONDITIONS = new Set<FleetHealthConditionState>([
  'good',
  'warning',
  'critical',
  'unknown',
]);

export function normalizeFleetHealthConditionState(
  value: HealthState | null | undefined,
): FleetHealthConditionState {
  if (!value || value === 'n_a') {
    return 'unknown';
  }
  if (KNOWN_CONDITIONS.has(value as FleetHealthConditionState)) {
    return value as FleetHealthConditionState;
  }
  return 'unknown';
}

export function toFleetHealthEvaluationDto(
  projection: VehicleOperationalProjection,
): FleetHealthEvaluationDto {
  return {
    condition: normalizeFleetHealthConditionState(
      projection.evidence.healthConditionState,
    ),
    evaluability: projection.healthEvaluability,
    pipelineAvailability: projection.evidence.healthPipelineAvailability,
    generatedAt: projection.generatedAt,
    healthEvidenceAt: projection.evidence.healthEvidenceAt,
    anyModuleDataStale: projection.evidence.anyModuleDataStale,
    source: 'p0.2_projection',
  };
}

export const FLEET_HEALTH_EVALUATION_UNKNOWN: FleetHealthEvaluationDto = {
  condition: 'unknown',
  evaluability: 'UNKNOWN',
  pipelineAvailability: null,
  generatedAt: new Date(0).toISOString(),
  healthEvidenceAt: null,
  anyModuleDataStale: null,
  source: 'p0.2_projection',
};

/**
 * Conservative fallback when P0.2 projection is missing for a vehicle
 * or the batch loader failed. Uses a single request-scoped `generatedAt`.
 */
export function createFleetHealthEvaluationUnknownFallback(
  generatedAt: string,
): FleetHealthEvaluationDto {
  return {
    ...FLEET_HEALTH_EVALUATION_UNKNOWN,
    generatedAt,
  };
}
