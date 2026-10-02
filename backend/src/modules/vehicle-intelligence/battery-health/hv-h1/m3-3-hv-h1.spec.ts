import { BatteryMeasurementType } from '@prisma/client';
import { BatteryCapabilityStatus } from '../battery-v2-domain';
import { HV_ERD_SIGNAL_KEYS } from '../hv-erd-capability-signal-keys';
import {
  HV_CAPACITY_METHOD_REQUIRED_SIGNAL_KEYS,
  assertHvCapacityMethodRequirementParity,
  methodRequiresSignal,
} from '../hv-method-profile/hv-capacity-method-signal-requirements';
import { HV_CAPACITY_METHODS } from '../hv-method-profile/hv-method-profile.types';
import { resolveHvMethodProfile } from '../hv-method-profile/hv-method-profile.resolver';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { evaluateM3_3HvH1EvidenceQualityV1 } from './m3-3-hv-h1-evidence-quality.evaluator';
import {
  buildM3_3HvH1ProviderCapabilityMatrixV1,
  classifyHvH1Freshness,
  classifyHvH1ProviderListingStatus,
  classifyHvH1VehicleDataStatus,
} from './m3-3-hv-h1-provider-capability-matrix.builder';
import type { M3_3HvH1CapabilityMatrixPersistedRow } from './m3-3-hv-h1-provider-capability-matrix.types';
import { evaluateM3_3HvH1Readiness } from './m3-3-hv-h1-readiness.model';
import {
  buildM3_3HvH1SessionEvidenceLinkageV1,
  sessionFieldPresenceFromRecord,
} from './m3-3-hv-h1-session-evidence-linkage';
import {
  isStrongHvChargeSessionForH1,
  summarizeHvChargeSessionsForH1,
} from './m3-3-hv-h1-session-summary';
import {
  CROSS_METHOD_POOLING_DEFAULT,
  METHOD_IDENTITY_REQUIRED,
} from './m3-3-hv-h1.constants';
import {
  HV_DISTINCT_CURRENT_SURFACE_COUNT,
  HV_MAPPER_FIELD_COUNT,
  HV_REGISTRY_KEY_COUNT,
  buildM3_3HvH1SignalInventory,
} from './m3-3-hv-h1-signal-inventory';

describe('M3.3-HV-H1 signal inventory', () => {
  it('preserves H0 HV surface counts and static surface role', () => {
    expect(HV_REGISTRY_KEY_COUNT).toBe(12);
    expect(HV_MAPPER_FIELD_COUNT).toBe(12);
    expect(HV_DISTINCT_CURRENT_SURFACE_COUNT).toBe(13);
    expect(METHOD_IDENTITY_REQUIRED).toBe(true);
    expect(CROSS_METHOD_POOLING_DEFAULT).toBe(false);
    const inventory = buildM3_3HvH1SignalInventory();
    expect(inventory.filter((e) => e.registryPresent).length).toBe(12);
    expect(inventory.every((e) => e.staticSurfaceRole === 'IMPLEMENTED_SIGNAL_SURFACE')).toBe(true);
    expect(inventory.find((e) => e.mapperPresent && !e.registryPresent)?.providerSignal).toBe(
      'powertrainTractionBatteryCurrentVoltage',
    );
  });
});

describe('M3.3-HV-H1 method requirement authority', () => {
  it('covers every HvCapacityMethod with non-empty signal keys', () => {
    assertHvCapacityMethodRequirementParity();
    expect(HV_CAPACITY_METHODS.length).toBe(5);
  });

  it('SESSION_CHARGE_CAPACITY requires recharge segments + added energy only', () => {
    expect(HV_CAPACITY_METHOD_REQUIRED_SIGNAL_KEYS.SESSION_CHARGE_CAPACITY).toEqual([
      HV_ERD_SIGNAL_KEYS.rechargeSegments,
      HV_ERD_SIGNAL_KEYS.addedEnergy,
    ]);
    expect(methodRequiresSignal('SESSION_CHARGE_CAPACITY', 'hv.soc')).toBe(false);
    expect(methodRequiresSignal('SESSION_CHARGE_CAPACITY', 'hv.current_energy')).toBe(false);
  });

  it('does not cross-pool method requirements', () => {
    const m2Keys = new Set(HV_CAPACITY_METHOD_REQUIRED_SIGNAL_KEYS.M2_CURRENT_ENERGY_SOC);
    const m3Keys = new Set(HV_CAPACITY_METHOD_REQUIRED_SIGNAL_KEYS.M3_ADDED_ENERGY_DELTA_SOC);
    expect(m2Keys).not.toEqual(m3Keys);
  });
});

describe('M3.3-HV-H1 provider capability matrix', () => {
  const evaluationAt = new Date('2026-09-30T12:00:00.000Z');
  const checkedAt = new Date('2026-09-30T11:00:00.000Z');
  const sourceTs = new Date('2026-09-30T10:30:00.000Z');

  function persisted(
    rows: Partial<M3_3HvH1CapabilityMatrixPersistedRow> &
      Pick<M3_3HvH1CapabilityMatrixPersistedRow, 'signalKey' | 'status'>,
  ): M3_3HvH1CapabilityMatrixPersistedRow {
    return {
      checkedAt,
      lastSeenAt: sourceTs,
      sourceTimestamp: sourceTs,
      lastValue: 42,
      provider: 'DIMO',
      measurementType: BatteryMeasurementType.LIVE_VOLTAGE,
      ...rows,
    };
  }

  it('preserves provider and measurementType from persisted capability rows', () => {
    const methodProfile = resolveHvMethodProfile({
      vehicleId: 'veh-1',
      capabilities: [
        {
          signalKey: 'hv.soc',
          status: BatteryCapabilityStatus.AVAILABLE,
          checkedAt,
          lastSeenAt: sourceTs,
          sourceTimestamp: sourceTs,
          lastValue: 55,
        },
      ],
      now: evaluationAt,
    });
    const matrix = buildM3_3HvH1ProviderCapabilityMatrixV1({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      persistedRows: [
        persisted({
          signalKey: 'hv.soc',
          status: BatteryCapabilityStatus.AVAILABLE,
          provider: 'HIGH_MOBILITY',
          measurementType: BatteryMeasurementType.CHARGING_VOLTAGE,
        }),
      ],
      methodProfile,
      evaluationAt,
    });
    const soc = matrix.rows[0]!;
    expect(soc.provider).toBe('HIGH_MOBILITY');
    expect(soc.measurementType).toBe(BatteryMeasurementType.CHARGING_VOLTAGE);
    expect(soc.freshnessClass).toBe('FRESH_PROVIDER_TIMESTAMP');
  });

  it('QUERY_ERROR yields provider listing UNKNOWN not listed', () => {
    expect(classifyHvH1ProviderListingStatus(BatteryCapabilityStatus.QUERY_ERROR)).toBe('UNKNOWN');
    const methodProfile = resolveHvMethodProfile({ vehicleId: 'v', capabilities: [], now: evaluationAt });
    const matrix = buildM3_3HvH1ProviderCapabilityMatrixV1({
      organizationId: 'o',
      vehicleId: 'v',
      persistedRows: [
        persisted({ signalKey: 'hv.soc', status: BatteryCapabilityStatus.QUERY_ERROR, provider: 'DIMO' }),
      ],
      methodProfile,
      evaluationAt,
    });
    expect(matrix.rows[0]!.providerListingStatus).toBe('UNKNOWN');
    expect(matrix.rows[0]!.providerListed).toBe(false);
  });

  it('AVAILABLE_NULL remains LISTED_NO_VALUE', () => {
    expect(classifyHvH1VehicleDataStatus(BatteryCapabilityStatus.AVAILABLE_NULL)).toBe('LISTED_NO_VALUE');
  });

  it('classifies future provider timestamp as fail-closed freshness', () => {
    const future = new Date('2099-01-01T00:00:00.000Z');
    expect(
      classifyHvH1Freshness({
        sourceTimestamp: future,
        lastSeenAt: null,
        checkedAt,
        capabilityStatus: BatteryCapabilityStatus.AVAILABLE,
        evaluationAt,
      }),
    ).toBe('FUTURE_PROVIDER_TIMESTAMP');
  });

  it('classifies stale provider timestamp', () => {
    const stale = new Date('2020-01-01T00:00:00.000Z');
    expect(
      classifyHvH1Freshness({
        sourceTimestamp: stale,
        lastSeenAt: null,
        checkedAt,
        capabilityStatus: BatteryCapabilityStatus.AVAILABLE,
        evaluationAt,
      }),
    ).toBe('STALE_PROVIDER_TIMESTAMP');
  });
});

describe('M3.3-HV-H1 evidence quality', () => {
  it('fail-closes scientific eligibility when unit/range not evaluated', () => {
    const quality = evaluateM3_3HvH1EvidenceQualityV1({
      signalKey: 'hv.soc',
      freshnessClass: 'FRESH_PROVIDER_TIMESTAMP',
      qualityClass: 'CAPABILITY_USABLE',
      providerListingStatus: 'LISTED',
      vehicleDataStatus: 'AVAILABLE_WITH_DATA',
      lastProviderValuePresent: true,
      lastProviderTimestampPresent: true,
      methodEligible: true,
    });
    expect(quality.unitValidation).toBe('UNKNOWN_NOT_EVALUATED');
    expect(quality.rangeValidation).toBe('UNKNOWN_NOT_EVALUATED');
    expect(quality.scientificEligible).toBe(false);
    expect(quality.reasonCodes).toContain('UNIT_NOT_EVALUATED');
    expect(quality.reasonCodes).toContain('FAIL_CLOSED_SCIENTIFIC');
  });

  it('fail-closes on future timestamp freshness class', () => {
    const quality = evaluateM3_3HvH1EvidenceQualityV1({
      signalKey: 'hv.soc',
      freshnessClass: 'FUTURE_PROVIDER_TIMESTAMP',
      qualityClass: 'CAPABILITY_USABLE',
      providerListingStatus: 'LISTED',
      vehicleDataStatus: 'AVAILABLE_WITH_DATA',
      lastProviderValuePresent: true,
      lastProviderTimestampPresent: true,
      methodEligible: true,
    });
    expect(quality.scientificEligible).toBe(false);
    expect(quality.reasonCodes).toContain('TIMESTAMP_FUTURE');
  });
});

describe('M3.3-HV-H1 readiness dimensions', () => {
  const evaluationAt = new Date('2026-09-30T12:00:00.000Z');
  const emptyMatrix = buildM3_3HvH1ProviderCapabilityMatrixV1({
    organizationId: 'o',
    vehicleId: 'v',
    persistedRows: [],
    methodProfile: resolveHvMethodProfile({ vehicleId: 'v', capabilities: [], now: evaluationAt }),
    evaluationAt,
  });

  it('does not use arbitrary generic row-count thresholds', () => {
    const readiness = evaluateM3_3HvH1Readiness({
      matrix: emptyMatrix,
      methodProfile: resolveHvMethodProfile({ vehicleId: 'v', capabilities: [], now: evaluationAt }),
      sessionCounts: summarizeHvChargeSessionsForH1([]),
      m2ShadowObservationCount: 0,
      m3ShadowObservationCount: 0,
      providerSohObservationCount: 0,
      providerSohQualifiedEvidenceCount: 0,
      longitudinalCandidateCount: 0,
    });
    expect(readiness).not.toHaveProperty('capabilityReady');
    expect(readiness.m2EvidenceReady.ready).toBe(false);
    expect(readiness.longitudinalInputReady.ready).toBe(false);
    expect(readiness.longitudinalInputReady.reason).toContain('NOT_IMPLEMENTED');
  });

  it('M2 evidence ready only with shadow observation count', () => {
    const methodProfile = resolveHvMethodProfile({
      vehicleId: 'v',
      capabilities: [
        {
          signalKey: 'hv.soc',
          status: BatteryCapabilityStatus.AVAILABLE,
          checkedAt: evaluationAt,
          lastSeenAt: evaluationAt,
          sourceTimestamp: evaluationAt,
          lastValue: 50,
        },
        {
          signalKey: 'hv.current_energy',
          status: BatteryCapabilityStatus.AVAILABLE,
          checkedAt: evaluationAt,
          lastSeenAt: evaluationAt,
          sourceTimestamp: evaluationAt,
          lastValue: 40,
        },
      ],
      now: evaluationAt,
    });
    const matrix = buildM3_3HvH1ProviderCapabilityMatrixV1({
      organizationId: 'o',
      vehicleId: 'v',
      persistedRows: [],
      methodProfile,
      evaluationAt,
    });
    const withCapOnly = evaluateM3_3HvH1Readiness({
      matrix,
      methodProfile,
      sessionCounts: summarizeHvChargeSessionsForH1([]),
      m2ShadowObservationCount: 0,
      m3ShadowObservationCount: 0,
      providerSohObservationCount: 0,
      providerSohQualifiedEvidenceCount: 0,
      longitudinalCandidateCount: 0,
    });
    expect(withCapOnly.m2CapabilityReady.ready).toBe(true);
    expect(withCapOnly.m2EvidenceReady.ready).toBe(false);

    const withEvidence = evaluateM3_3HvH1Readiness({
      matrix,
      methodProfile,
      sessionCounts: summarizeHvChargeSessionsForH1([]),
      m2ShadowObservationCount: 1,
      m3ShadowObservationCount: 0,
      providerSohObservationCount: 0,
      providerSohQualifiedEvidenceCount: 0,
      longitudinalCandidateCount: 0,
    });
    expect(withEvidence.m2EvidenceReady.ready).toBe(true);
  });
});

describe('M3.3-HV-H1 provider SOH qualified evidence', () => {
  it('requires finite 0-100 provider-reported HV SOH for readiness', () => {
    const evaluationAt = new Date('2026-09-30T12:00:00.000Z');
    const readiness = evaluateM3_3HvH1Readiness({
      methodProfile: resolveHvMethodProfile({ vehicleId: 'v', capabilities: [], now: evaluationAt }),
      matrix: buildM3_3HvH1ProviderCapabilityMatrixV1({
        organizationId: 'o',
        vehicleId: 'v',
        persistedRows: [],
        methodProfile: resolveHvMethodProfile({ vehicleId: 'v', capabilities: [], now: evaluationAt }),
        evaluationAt,
      }),
      sessionCounts: summarizeHvChargeSessionsForH1([]),
      m2ShadowObservationCount: 0,
      m3ShadowObservationCount: 0,
      providerSohObservationCount: 1,
      providerSohQualifiedEvidenceCount: 0,
      longitudinalCandidateCount: 0,
    });
    expect(readiness.providerSohEvidenceReady.ready).toBe(false);
    expect(readiness.providerSohEvidenceReady.reason).toContain('not_qualified');
  });
});
describe('M3.3-HV-H1 session quality and linkage', () => {
  it('native DIMO source alone is not strong session', () => {
    const nativeWeak = {
      source: 'DIMO_RECHARGE_SEGMENT',
      isOngoing: false,
      metadata: { qualityStatus: 'INCOMPLETE' },
    };
    expect(isStrongHvChargeSessionForH1(nativeWeak)).toBe(false);
    const strong = {
      source: 'DIMO_RECHARGE_SEGMENT',
      isOngoing: false,
      metadata: { qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED },
    };
    expect(isStrongHvChargeSessionForH1(strong)).toBe(true);
    const counts = summarizeHvChargeSessionsForH1([nativeWeak, strong]);
    expect(counts.nativeDimoSessionCount).toBe(2);
    expect(counts.strongSessionCount).toBe(1);
    expect(counts.weakSessionCount).toBe(1);
  });

  it('marks null session fields UNLINKED not DIRECT', () => {
    const presence = sessionFieldPresenceFromRecord({
      startSocPercent: null,
      endSocPercent: 55,
      startEnergyKwh: null,
      endEnergyKwh: 40,
      energyAddedKwh: null,
      providerObservedAt: null,
      metadata: {},
    });
    const linkage = buildM3_3HvH1SessionEvidenceLinkageV1({
      sessionId: 's1',
      segmentFingerprint: 'fp',
      source: 'DIMO_RECHARGE_SEGMENT',
      isFallback: false,
      hasDimoSegmentId: true,
      presence,
    });
    const byField = Object.fromEntries(linkage.linkages.map((l) => [l.field, l.linkage]));
    expect(byField.soc_start).toBe('UNLINKED');
    expect(byField.soc_end).toBe('DIRECT');
    expect(byField.added_energy).toBe('UNLINKED');
  });

  it('classifies fallback session energy linkage as WINDOW_DERIVED when present', () => {
    const presence = sessionFieldPresenceFromRecord({
      startSocPercent: 10,
      endSocPercent: 80,
      startEnergyKwh: 5,
      endEnergyKwh: 50,
      energyAddedKwh: 45,
      providerObservedAt: new Date(),
      metadata: {},
    });
    const linkage = buildM3_3HvH1SessionEvidenceLinkageV1({
      sessionId: 's2',
      segmentFingerprint: 'fp2',
      source: 'TELEMETRY_POLL_FALLBACK',
      isFallback: true,
      hasDimoSegmentId: false,
      presence,
    });
    const startEnergy = linkage.linkages.find((l) => l.field === 'current_energy_start')!;
    expect(startEnergy.linkage).toBe('WINDOW_DERIVED');
  });
});
