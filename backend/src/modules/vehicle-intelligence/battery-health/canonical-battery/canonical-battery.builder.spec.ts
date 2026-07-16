import { resolveBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.resolver';
import {
  BatteryChemistry,
  BatteryDriveProfile,
} from '../battery-v2-domain';
import { HV_M2_CAPACITY_METHOD } from '../hv-capacity-shadow/hv-capacity-m2.types';
import {
  buildCanonicalBatteryDto,
  collectStaleReasons,
  collectUnsupportedReasons,
  mapChargeSessionInputRow,
  mapCrossSessionAssessmentRow,
  mapLiveStatusFromLegacy,
  mapSohGateAssessmentRow,
} from './canonical-battery.builder';
import { CANONICAL_BATTERY_RESOLVER_VERSION } from './canonical-battery.types';
import type { CanonicalLvBatteryResponse } from '../lv-canonical/lv-canonical-battery.types';
import type { HvMethodProfile } from '../hv-method-profile/hv-method-profile.types';

describe('canonical-battery.builder', () => {
  const now = new Date('2026-07-16T12:00:00.000Z');
  const policy = resolveBatteryPolicy({
    driveProfile: BatteryDriveProfile.BEV,
    chemistry: BatteryChemistry.LITHIUM,
    lvSignalPresent: true,
  });

  const lvCanonical = {
    resolverVersion: '1.0.0',
    vehicleId: 'veh-1',
    resolvedAt: now.toISOString(),
    profile: {
      profile: policy.profile,
      driveProfile: policy.driveProfile,
      lvAssessmentAllowed: true,
      supported: true,
    },
    chemistry: {
      chemistry: policy.chemistry,
      chemicalSocEstimationAllowed: true,
    },
    primaryTruth: {
      source: 'V2_PUBLICATION_STABLE' as const,
      estimatedHealthScore: 80,
      semanticType: 'ESTIMATED_HEALTH_NOT_SOH' as const,
      labelDe: 'Geschätzter 12V-Batteriezustand' as const,
      decisionCapable: true,
    },
    liveVoltage: null,
    latestQualifiedRestMeasurement: null,
    latestStartProxy: null,
    assessment: null,
    publication: null,
    freshness: { fetch: null, observation: null },
    quality: {
      aggregate: { status: 'ESTIMATED', labelDe: 'Geschätzt' },
      primaryTruth: { status: 'ESTIMATED', labelDe: 'Geschätzt' },
    },
    legacyDiagnostic: null,
    unsupported: false,
    unavailable: false,
  } as unknown as CanonicalLvBatteryResponse;

  const hvMethodProfile = {
    resolverVersion: '1.0.0',
    vehicleId: 'veh-1',
    resolvedAt: now.toISOString(),
    socAvailable: true,
    currentEnergyAvailable: true,
    addedEnergyAvailable: true,
    rechargeSegmentsAvailable: true,
    isChargingAvailable: true,
    chargingCableConnectedAvailable: true,
    providerSohAvailable: true,
    grossCapacityAvailable: true,
    packTemperatureAvailable: true,
    chargingPowerAvailable: true,
    currentPowerAvailable: true,
    supportedCapacityMethods: [HV_M2_CAPACITY_METHOD],
    unsupportedReasons: [],
    lastCheckedAt: now.toISOString(),
    dataQuality: { status: 'VERIFIED', labelDe: 'Verifiziert' },
  } as unknown as HvMethodProfile;

  it('builds canonical battery DTO with liveState, lv, hv, capabilities, dataQuality, legacy', () => {
    const dto = buildCanonicalBatteryDto({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      resolvedAt: now,
      isEv: true,
      policy,
      hvMethodProfile,
      lvCanonical,
      lvStatus: mapLiveStatusFromLegacy('ready'),
      hvStatus: mapLiveStatusFromLegacy('ready'),
      lvLive: {
        voltageV: 12.5,
        voltageSource: 'live_telemetry',
        temperatureC: 20,
        restingVoltageV: 12.4,
        crankingVoltageV: null,
        chargingVoltageV: null,
        engineRunning: false,
        observedAt: now.toISOString(),
        receivedAt: now.toISOString(),
      },
      hvLive: {
        socPercent: 72,
        rangeKm: 280,
        currentEnergyKwh: 52,
        grossCapacityKwh: 76,
        addedEnergyKwh: 4,
        chargingPowerKw: 11,
        currentVoltageV: 360,
        temperatureC: 24,
        isCharging: true,
        chargingCableConnected: true,
        providerSohPercent: 88,
        observedAt: now.toISOString(),
        receivedAt: now.toISOString(),
      },
      hvProviderSoh: {
        percent: 88,
        source: 'PROVIDER',
        observedAt: now.toISOString(),
        decisionFresh: true,
        evidenceType: 'provider_reported',
      },
      referenceCapacity: null,
      crossSessionAssessment: null,
      sohGateAssessment: null,
      chargeSessions: [],
      dataQuality: {
        aggregate: {
          status: 'VERIFIED',
          labelKey: 'battery.data_quality.verified',
          decisionCapable: true,
          observedAt: now.toISOString(),
        },
        slices: {
          lvEstimatedHealth: {
            status: 'ESTIMATED',
            labelKey: 'battery.data_quality.estimated',
            decisionCapable: false,
            observedAt: now.toISOString(),
          },
          lvRestingVoltage: {
            status: 'VERIFIED',
            labelKey: 'battery.data_quality.verified',
            decisionCapable: true,
            observedAt: now.toISOString(),
          },
          lvCrank: {
            status: 'UNAVAILABLE',
            labelKey: 'battery.data_quality.unavailable',
            decisionCapable: false,
            observedAt: null,
          },
          hvSoh: {
            status: 'VERIFIED',
            labelKey: 'battery.data_quality.verified',
            decisionCapable: true,
            observedAt: now.toISOString(),
          },
          hvLegacyCapacity: {
            status: 'UNAVAILABLE',
            labelKey: 'battery.data_quality.unavailable',
            decisionCapable: false,
            observedAt: null,
          },
        },
        fetchFreshness: null,
        observationFreshness: null,
        lvFreshnessBundle: null,
        hvFreshnessBundle: null,
        staleReasons: [],
        unsupportedReasons: [],
        errors: [],
      },
      legacy: {
        collapsed: true,
        lvDiagnostic: null,
        hvLegacyCapacity: null,
        crankDiagnostic: null,
        startProxyDiagnostic: null,
        v2Features: null,
      },
    });

    expect(dto.resolverVersion).toBe(CANONICAL_BATTERY_RESOLVER_VERSION);
    expect(dto.liveState.lv.values.voltageV).toBe(12.5);
    expect(dto.hv?.chargingState.state).toBe('charging');
    expect(dto.lv.canonical.primaryTruth.estimatedHealthScore).toBe(80);
    expect(dto.capabilities.policy.driveProfile).toBe(BatteryDriveProfile.BEV);
    expect(dto.legacy.collapsed).toBe(true);
  });

  it('maps charge session metadata into canonical charge session input', () => {
    const row = mapChargeSessionInputRow({
      id: 'session-1',
      source: 'DIMO_RECHARGE_SEGMENT',
      startAt: now,
      endAt: null,
      isOngoing: true,
      metadata: {
        providerSegmentFingerprint: 'fp-1',
        durationSeconds: 3600,
        lastReconciledAt: now.toISOString(),
        reconcileVersion: 1,
        qualityStatus: 'QUALIFIED',
        capacityShadowEligible: true,
        m2CapacitySummary: {
          method: HV_M2_CAPACITY_METHOD,
          gateVersion: 1,
          modelVersion: 1,
          computedAt: now.toISOString(),
          status: 'STABLE_SHADOW',
          shadowGatePassed: true,
          gateReasonCodes: [],
          stats: {
            validSampleCount: 8,
            totalSampleCount: 8,
            outlierCount: 0,
            medianCapacityKwh: 55.4,
            p10CapacityKwh: null,
            p90CapacityKwh: null,
            madKwh: null,
            robustSpreadKwh: null,
            coefficientOfVariation: 0.01,
            minSocPercent: 20,
            maxSocPercent: 80,
            preferredBandSampleCount: 6,
            socSpanPercent: 60,
            temporalCoverageRatio: 1,
            temporalSpanMs: 3600000,
            providerGapCount: 0,
            maxProviderGapMs: null,
            dominantDuplicateRatio: 0,
          },
        },
      },
    });

    expect(row.capacityShadowEligible).toBe(true);
    expect(row.sessionMedianKwh).toBe(55.4);
    expect(row.shadowGatePassed).toBe(true);
  });

  it('maps cross-session and SOH gate assessment rows', () => {
    const cross = mapCrossSessionAssessmentRow({
      id: 'cross-1',
      scoreValue: 55.1,
      confidence: 'MEDIUM',
      modelVersion: 1,
      computedAt: now,
      inputSummary: {
        confidence: 'MEDIUM',
        maturity: 'SHADOW',
        shadowGatePassed: true,
        gateReasonCodes: [],
        sessionCount: 3,
      },
    });
    const sohGate = mapSohGateAssessmentRow({
      id: 'gate-1',
      scoreValue: 96.7,
      confidence: 'MEDIUM',
      modelVersion: 1,
      computedAt: now,
      inputSummary: {
        sohAvailability: 'COMPUTED_INTERNAL',
        estimatedUsableCapacityKwh: 55.1,
        verifiedReferenceCapacityKwh: 57,
        maturity: 'SHADOW',
        confidence: 'MEDIUM',
        sohGatePassed: true,
        gateReasonCodes: [],
        sohPublicationEnabled: false,
      },
    });

    expect(cross?.shadowGatePassed).toBe(true);
    expect(cross?.sessionCount).toBe(3);
    expect(sohGate?.sohPublicationEnabled).toBe(false);
    expect(sohGate?.estimatedSohPercent).toBe(96.7);
  });

  it('collects stale and unsupported reasons', () => {
    const stale = collectStaleReasons({
      lvFreshness: { isFresh: false, observedAt: null, ageMs: null },
      hvFreshness: { isFresh: true, observedAt: now.toISOString(), ageMs: 0 },
      lvStatus: 'no_recent_data',
      hvStatus: 'ready',
      isEv: true,
    });
    const unsupported = collectUnsupportedReasons({
      lvCanonical: { ...lvCanonical, unsupported: true },
      policy: { ...policy, lvAssessmentAllowed: false },
      hvMethodProfile: {
        ...hvMethodProfile,
        unsupportedReasons: [{ code: 'NO_SOC', labelDe: 'SOC nicht verfügbar' }],
      },
      isEv: false,
    });

    expect(stale).toContain('LV observation stale or missing');
    expect(stale).toContain('No recent LV sample');
    expect(unsupported).toContain('LV assessment unsupported for vehicle profile');
    expect(unsupported).toContain('HV traction battery not applicable (non-EV profile)');
  });
});
