import {
  isErdFallbackEligibleFuelType,
} from './hv-fallback-charge-session-activation.policy';
import type { HvMethodProfile } from '../hv-method-profile/hv-method-profile.types';
import {
  HV_E3_FALLBACK_CORROBORATING_SIGNAL_KEYS,
  HV_ERD_SIGNAL_KEYS,
} from '../hv-erd-capability-signal-keys';
import { hasFallbackTelemetryCapabilities } from './hv-fallback-charge-session-activation.policy';

/** SOC is mandatory for ERD telemetry fallback reconciliation. */
export const HV_ERD_SOC_SIGNAL_KEY = HV_ERD_SIGNAL_KEYS.soc;

/** Corroborating HV signals aligned with E3 fallback activation (charging_power, not current_power). */
export const HV_ERD_FALLBACK_CORROBORATING_SIGNAL_KEYS = HV_E3_FALLBACK_CORROBORATING_SIGNAL_KEYS;

export type HvErdReconcileEligibilityCategory =
  | 'ongoing_hv_charge_session'
  | 'native_recharge_capability'
  | 'telemetry_fallback_capability';

export type HvErdReconcileEligibilityResult =
  | { eligible: true; category: HvErdReconcileEligibilityCategory }
  | { eligible: false; reason: 'ice_only' | 'insufficient_telemetry_capability' | 'not_eligible' };

const AVAILABLE_CAPABILITY = new Set(['AVAILABLE', 'AVAILABLE_STALE']);

export function isBatteryCapabilityRowAvailable(status: string): boolean {
  return AVAILABLE_CAPABILITY.has(status);
}

export function vehicleHasErdFallbackTelemetryFromCapabilityKeys(
  capabilityKeysAvailable: ReadonlySet<string>,
): boolean {
  if (!capabilityKeysAvailable.has(HV_ERD_SOC_SIGNAL_KEY)) return false;
  return HV_ERD_FALLBACK_CORROBORATING_SIGNAL_KEYS.some((key) =>
    capabilityKeysAvailable.has(key),
  );
}

/**
 * Canonical ERD reconciliation eligibility — shared by periodic selector and runtime reconcile.
 * ICE-only vehicles are never fallback-selected; native-capable EVs remain eligible via dimo.segments.recharge.
 */
export function evaluateErdReconcileEligibility(input: {
  fuelType: string | null | undefined;
  hasOngoingHvChargeSession: boolean;
  nativeRechargeCapable: boolean;
  capabilityKeysAvailable: ReadonlySet<string>;
}): HvErdReconcileEligibilityResult {
  if (input.hasOngoingHvChargeSession) {
    return { eligible: true, category: 'ongoing_hv_charge_session' };
  }

  if (input.nativeRechargeCapable) {
    if (!isErdFallbackEligibleFuelType(input.fuelType)) {
      return { eligible: false, reason: 'ice_only' };
    }
    return { eligible: true, category: 'native_recharge_capability' };
  }

  if (!isErdFallbackEligibleFuelType(input.fuelType)) {
    return { eligible: false, reason: 'ice_only' };
  }

  if (!vehicleHasErdFallbackTelemetryFromCapabilityKeys(input.capabilityKeysAvailable)) {
    return { eligible: false, reason: 'insufficient_telemetry_capability' };
  }

  return { eligible: true, category: 'telemetry_fallback_capability' };
}

/** Runtime alignment: same telemetry rule as E3 shouldAttemptFallbackDetection (profile-based). */
export function erdReconcileEligibilityMatchesFallbackRuntimePolicy(input: {
  fuelType: string | null | undefined;
  profile: HvMethodProfile;
}): boolean {
  if (!isErdFallbackEligibleFuelType(input.fuelType)) return false;
  return hasFallbackTelemetryCapabilities(input.profile);
}
