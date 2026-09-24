import {
  hasFallbackTelemetryCapabilities,
  isErdFallbackEligibleFuelType,
  shouldAttemptFallbackDetection,
} from './hv-fallback-charge-session-activation.policy';
import type { HvMethodProfile } from '../hv-method-profile/hv-method-profile.types';

const EVAL = new Date('2026-07-16T12:00:00.000Z');

function profile(overrides: Partial<HvMethodProfile> = {}): HvMethodProfile {
  return {
    resolverVersion: '1.0.0',
    vehicleId: 'veh',
    resolvedAt: EVAL.toISOString(),
    socAvailable: true,
    currentEnergyAvailable: true,
    addedEnergyAvailable: true,
    rechargeSegmentsAvailable: true,
    isChargingAvailable: true,
    chargingCableConnectedAvailable: true,
    providerSohAvailable: false,
    grossCapacityAvailable: false,
    packTemperatureAvailable: false,
    chargingPowerAvailable: true,
    currentPowerAvailable: false,
    supportedCapacityMethods: [],
    unsupportedReasons: [],
    lastCheckedAt: EVAL.toISOString(),
    dataQuality: {
      status: 'VERIFIED',
      labelKey: 'health.battery.dataQuality.verified',
      decisionCapable: true,
      observedAt: EVAL.toISOString(),
    },
    ...overrides,
  };
}

describe('ERD capability routing matrix (semantic profiles)', () => {
  it('PROFILE_NATIVE_AVAILABLE prefers native path but allows fallback attempt when eligible', () => {
    const p = profile({ rechargeSegmentsAvailable: true });
    expect(
      shouldAttemptFallbackDetection({ profile: p, fuelType: 'ELECTRIC' }).allowed,
    ).toBe(true);
  });

  it('PROFILE_NATIVE_DELAYED_WITH_TELEMETRY allows provisional fallback', () => {
    const p = profile({ rechargeSegmentsAvailable: true });
    expect(hasFallbackTelemetryCapabilities(p)).toBe(true);
  });

  it('PROFILE_TELEMETRY_ONLY allows fallback without native capability', () => {
    const p = profile({ rechargeSegmentsAvailable: false });
    expect(
      shouldAttemptFallbackDetection({ profile: p, fuelType: 'ELECTRIC' }).allowed,
    ).toBe(true);
  });

  it('PROFILE_INSUFFICIENT_EVIDENCE blocks fallback', () => {
    const p = profile({
      rechargeSegmentsAvailable: false,
      isChargingAvailable: false,
      chargingCableConnectedAvailable: false,
      addedEnergyAvailable: false,
      chargingPowerAvailable: false,
    });
    expect(
      shouldAttemptFallbackDetection({ profile: p, fuelType: 'ELECTRIC' }).allowed,
    ).toBe(false);
  });

  it('PROFILE_ICE_ONLY blocks fallback', () => {
    expect(isErdFallbackEligibleFuelType('DIESEL')).toBe(false);
  });
});
