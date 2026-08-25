/**
 * P0.4 — Health condition + P0.2 evaluability states for Fleet presentation.
 */
export const HEALTH_EVALUABILITY_STATE = {
  EVALUABLE: 'EVALUABLE',
  PARTIALLY_EVALUABLE: 'PARTIALLY_EVALUABLE',
  NOT_EVALUABLE: 'NOT_EVALUABLE',
  UNKNOWN: 'UNKNOWN',
} as const;

export type HealthEvaluabilityState =
  (typeof HEALTH_EVALUABILITY_STATE)[keyof typeof HEALTH_EVALUABILITY_STATE];

export const FLEET_HEALTH_CONDITION = {
  GOOD: 'good',
  WARNING: 'warning',
  CRITICAL: 'critical',
  UNKNOWN: 'unknown',
} as const;

export type FleetHealthConditionState =
  (typeof FLEET_HEALTH_CONDITION)[keyof typeof FLEET_HEALTH_CONDITION];

export interface FleetHealthEvaluation {
  condition: FleetHealthConditionState;
  evaluability: HealthEvaluabilityState;
  pipelineAvailability: 'ready' | 'partial' | 'unavailable' | null;
  generatedAt: string;
  healthEvidenceAt: string | null;
  anyModuleDataStale: boolean | null;
  source: string;
}

export function isHealthEvaluabilityState(value: unknown): value is HealthEvaluabilityState {
  return (
    value === HEALTH_EVALUABILITY_STATE.EVALUABLE ||
    value === HEALTH_EVALUABILITY_STATE.PARTIALLY_EVALUABLE ||
    value === HEALTH_EVALUABILITY_STATE.NOT_EVALUABLE ||
    value === HEALTH_EVALUABILITY_STATE.UNKNOWN
  );
}

export function normalizeHealthEvaluabilityState(value: unknown): HealthEvaluabilityState {
  return isHealthEvaluabilityState(value) ? value : HEALTH_EVALUABILITY_STATE.UNKNOWN;
}

export function isFleetHealthConditionState(value: unknown): value is FleetHealthConditionState {
  return (
    value === FLEET_HEALTH_CONDITION.GOOD ||
    value === FLEET_HEALTH_CONDITION.WARNING ||
    value === FLEET_HEALTH_CONDITION.CRITICAL ||
    value === FLEET_HEALTH_CONDITION.UNKNOWN
  );
}

export function normalizeFleetHealthConditionState(value: unknown): FleetHealthConditionState {
  return isFleetHealthConditionState(value)
    ? value
    : FLEET_HEALTH_CONDITION.UNKNOWN;
}
