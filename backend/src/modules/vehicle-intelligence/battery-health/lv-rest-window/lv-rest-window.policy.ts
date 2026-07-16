import type { ResolvedBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.types';
import { isRestMeasurementType } from '../../battery-policy-profile/battery-policy-profile.measurement-sets';
import type { LvRestWindowPolicyContext, LvRestWindowSignalContext } from './lv-rest-window.types';

export const DEFAULT_WAKE_VOLTAGE_THRESHOLD_V = 13.8;
export const DEFAULT_LV_CHARGING_VOLTAGE_THRESHOLD_V = 13.25;
export const DEFAULT_LV_REST_STABILITY_DWELL_MS = 5 * 60_000;
export const DEFAULT_LV_REST_MAX_WINDOW_MS = 24 * 60 * 60_000;

export function isLvRestWindowPolicySupported(
  policy: ResolvedBatteryPolicy,
): boolean {
  if (!policy.lvAssessmentAllowed) return false;
  return policy.supportedMeasurementTypes.some((type) =>
    isRestMeasurementType(type),
  );
}

export function buildLvRestWindowPolicyContext(
  policy: ResolvedBatteryPolicy,
): LvRestWindowPolicyContext {
  const maxRestingVoltage = policy.restingBands?.maxRestingV ?? 13.2;
  return {
    restWindowSupported: isLvRestWindowPolicySupported(policy),
    restRequiresEngineOff: policy.minimumContext.restRequiresEngineOff,
    maxRestingVoltage,
    wakeVoltageThreshold: Math.max(
      maxRestingVoltage + 0.5,
      DEFAULT_WAKE_VOLTAGE_THRESHOLD_V,
    ),
    stabilityDwellMs: DEFAULT_LV_REST_STABILITY_DWELL_MS,
    maxWindowMs: DEFAULT_LV_REST_MAX_WINDOW_MS,
  };
}

export function isSpeedAtRest(speedKmh: number | null): boolean {
  return speedKmh == null || speedKmh <= 0.5;
}

export function isEngineOffForRest(
  signal: LvRestWindowSignalContext,
  restRequiresEngineOff: boolean,
): boolean {
  if (!restRequiresEngineOff) return true;
  if (signal.ignitionOn === true) return false;
  if (signal.engineRunning === true) return false;
  return true;
}

export function isChargingContext(signal: LvRestWindowSignalContext): boolean {
  if (signal.isHvCharging || signal.isLvCharging) return true;
  if (
    signal.lvVoltage != null &&
    signal.lvVoltage >= DEFAULT_LV_CHARGING_VOLTAGE_THRESHOLD_V
  ) {
    return true;
  }
  return false;
}

export function isWakeVoltage(
  lvVoltage: number | null,
  wakeThreshold: number,
): boolean {
  return lvVoltage != null && lvVoltage >= wakeThreshold;
}

export function hasReliableProviderObservation(
  signal: LvRestWindowSignalContext,
): boolean {
  return !signal.providerError && signal.providerObservedAt != null;
}

export function isTripEndAnchorConsistent(
  signal: LvRestWindowSignalContext,
): boolean {
  if (!signal.tripEndAt || !signal.lastActivityAt) return false;
  return (
    Math.abs(signal.tripEndAt.getTime() - signal.lastActivityAt.getTime()) <=
    120_000
  );
}

export function canOpenRestWindowCandidate(
  signal: LvRestWindowSignalContext,
  policy: LvRestWindowPolicyContext,
): { ok: boolean; reason: string } {
  if (!policy.restWindowSupported) {
    return { ok: false, reason: 'lv_rest_not_supported_for_profile' };
  }
  if (signal.providerError) {
    return { ok: false, reason: 'provider_error' };
  }
  if (!hasReliableProviderObservation(signal)) {
    return { ok: false, reason: 'missing_provider_observed_at' };
  }
  if (!signal.tripEndAt || !signal.lastActivityAt) {
    return { ok: false, reason: 'missing_trip_end_anchor' };
  }
  if (!isTripEndAnchorConsistent(signal)) {
    return { ok: false, reason: 'trip_end_last_activity_mismatch' };
  }
  if (signal.hasActiveTrip) {
    return { ok: false, reason: 'active_trip' };
  }
  if (!isSpeedAtRest(signal.speedKmh)) {
    return { ok: false, reason: 'speed_not_zero' };
  }
  if (isChargingContext(signal)) {
    return { ok: false, reason: 'charging_context' };
  }
  if (!isEngineOffForRest(signal, policy.restRequiresEngineOff)) {
    return { ok: false, reason: 'engine_not_off' };
  }
  if (isWakeVoltage(signal.lvVoltage, policy.wakeVoltageThreshold)) {
    return { ok: false, reason: 'wake_voltage_at_trip_end' };
  }
  return { ok: true, reason: 'trip_end_anchor_valid' };
}

export function isValidRestSnapshot(
  signal: LvRestWindowSignalContext,
  policy: LvRestWindowPolicyContext,
  anchorAt: Date,
): { ok: boolean; reason: string } {
  if (signal.providerError) {
    return { ok: false, reason: 'provider_error' };
  }
  if (!hasReliableProviderObservation(signal)) {
    return { ok: false, reason: 'missing_provider_observed_at' };
  }
  if (signal.observedAt.getTime() < anchorAt.getTime()) {
    return { ok: false, reason: 'retroactive_observation' };
  }
  if (signal.hasActiveTrip) {
    return { ok: false, reason: 'active_trip' };
  }
  if (!isSpeedAtRest(signal.speedKmh)) {
    return { ok: false, reason: 'speed_not_zero' };
  }
  if (!isEngineOffForRest(signal, policy.restRequiresEngineOff)) {
    return { ok: false, reason: 'engine_not_off' };
  }
  if (isWakeVoltage(signal.lvVoltage, policy.wakeVoltageThreshold)) {
    return { ok: false, reason: 'wake_voltage' };
  }
  if (isChargingContext(signal)) {
    return { ok: false, reason: 'charging_context' };
  }
  if (
    signal.lvVoltage != null &&
    signal.lvVoltage > policy.maxRestingVoltage
  ) {
    return { ok: false, reason: 'above_max_resting_voltage' };
  }
  return { ok: true, reason: 'rest_snapshot_valid' };
}
