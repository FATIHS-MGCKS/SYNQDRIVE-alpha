import {
  hasFallbackTelemetryCapabilities,
  isErdFallbackEligibleFuelType,
  shouldAttemptFallbackDetection,
  shouldPersistFallbackCandidate,
} from './hv-fallback-charge-session-activation.policy';
import type { HvMethodProfile } from '../hv-method-profile/hv-method-profile.types';
import { HV_FALLBACK_DETECTION_TIER } from './hv-fallback-charge-session.types';
import type { HvChargeSessionRow } from './hv-charge-session.types';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from './hv-charge-session.types';

const EVAL = new Date('2026-07-16T12:00:00.000Z');

function baseProfile(overrides: Partial<HvMethodProfile> = {}): HvMethodProfile {
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

describe('hv-fallback-charge-session-activation.policy', () => {
  it('rejects ICE-only vehicles', () => {
    expect(isErdFallbackEligibleFuelType('DIESEL')).toBe(false);
    expect(
      shouldAttemptFallbackDetection({
        profile: baseProfile({ rechargeSegmentsAvailable: false }),
        fuelType: 'DIESEL',
      }).allowed,
    ).toBe(false);
  });

  it('allows native-capable BEV when telemetry capabilities exist', () => {
    const decision = shouldAttemptFallbackDetection({
      profile: baseProfile({ rechargeSegmentsAvailable: true }),
      fuelType: 'ELECTRIC',
    });
    expect(decision.allowed).toBe(true);
    expect(hasFallbackTelemetryCapabilities(baseProfile())).toBe(true);
  });

  it('blocks fallback when native SAME episode already covers candidate', () => {
    const candidate = {
      startAt: new Date('2026-07-16T08:00:00.000Z'),
      endAt: new Date('2026-07-16T10:00:00.000Z'),
      startSocPercent: 41,
      endSocPercent: 48,
      startEnergyKwh: 20,
      endEnergyKwh: 27,
      energyAddedKwh: 7,
      isOngoing: false,
      primaryTier: HV_FALLBACK_DETECTION_TIER.IS_CHARGING_FLANK,
      corroboratingTiers: [HV_FALLBACK_DETECTION_TIER.CABLE_CONNECTED],
      evidenceStrength: 'SUPPLEMENTARY' as const,
      observationCount: 5,
      endReason: 'CHARGING_OFF' as const,
      providerStale: false,
      maxChargingPowerKw: 11,
      deltaSocPercent: 7,
    };

    const nativeRow: HvChargeSessionRow = {
      id: 'native-1',
      organizationId: 'org',
      vehicleId: 'veh',
      segmentFingerprint: 'native-fp',
      dimoSegmentId: 'seg',
      source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
      startAt: new Date('2026-07-16T08:10:00.000Z'),
      endAt: new Date('2026-07-16T10:00:00.000Z'),
      startSocPercent: 41,
      endSocPercent: 48,
      startEnergyKwh: 20,
      endEnergyKwh: 28,
      energyAddedKwh: 8,
      deltaSocPercent: 7,
      isOngoing: false,
      quality: null,
      idempotencyKey: 'native-key',
      providerObservedAt: EVAL,
      metadata: {},
    };

    const decision = shouldPersistFallbackCandidate({
      vehicleId: 'veh',
      candidate,
      nativeSessions: [nativeRow],
      evaluatedAt: EVAL,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('native_episode_covers_candidate');
  });
});
