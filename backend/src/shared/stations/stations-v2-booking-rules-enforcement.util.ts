import type { StationsV2BookingRulesEnforcementMode } from './stations-v2-feature-flags.contract';

export interface StationsV2BookingRulesGateInput {
  enabled: boolean;
  enforcement: StationsV2BookingRulesEnforcementMode;
  capacityWarningsEnabled: boolean;
}

export interface StationsV2BookingRulesGateDecision {
  evaluate: boolean;
  persistSnapshot: boolean;
  enforcePersistenceBlock: boolean;
  attachToResponse: boolean;
  downgradeCapacityWarnings: boolean;
}

export interface StationsV2BookingRulesPersistenceAssessment {
  allowed: boolean;
  blocked: boolean;
  manualOverrideRequired: boolean;
}

export function resolveStationsV2BookingRulesGate(
  input: StationsV2BookingRulesGateInput,
): StationsV2BookingRulesGateDecision {
  if (!input.enabled || input.enforcement === 'off') {
    return {
      evaluate: false,
      persistSnapshot: false,
      enforcePersistenceBlock: false,
      attachToResponse: false,
      downgradeCapacityWarnings: true,
    };
  }

  return {
    evaluate: true,
    persistSnapshot: input.enforcement === 'warning' || input.enforcement === 'enforce',
    enforcePersistenceBlock: input.enforcement === 'enforce',
    attachToResponse: true,
    downgradeCapacityWarnings: !input.capacityWarningsEnabled,
  };
}

/**
 * Applies rollout enforcement mode on top of a base persistence assessment.
 * Callers on the full V2 stack pass `assessBookingStationRulesPersistence(result)` as `base`.
 */
export function assessBookingStationRulesWithEnforcementMode(
  base: StationsV2BookingRulesPersistenceAssessment,
  enforcement: StationsV2BookingRulesEnforcementMode,
): StationsV2BookingRulesPersistenceAssessment {
  if (enforcement === 'shadow') {
    return {
      allowed: true,
      blocked: false,
      manualOverrideRequired: false,
    };
  }

  if (enforcement === 'warning') {
    if (base.blocked) {
      return {
        allowed: true,
        blocked: false,
        manualOverrideRequired: false,
      };
    }
    if (base.manualOverrideRequired) {
      return {
        allowed: true,
        blocked: false,
        manualOverrideRequired: true,
      };
    }
  }

  return base;
}

export function shouldSurfaceCapacityWarning(
  outcome: string,
  gate: StationsV2BookingRulesGateDecision,
): boolean {
  if (gate.downgradeCapacityWarnings) return false;
  return outcome === 'WARNING' || outcome === 'MANUAL_CONFIRMATION_REQUIRED';
}
