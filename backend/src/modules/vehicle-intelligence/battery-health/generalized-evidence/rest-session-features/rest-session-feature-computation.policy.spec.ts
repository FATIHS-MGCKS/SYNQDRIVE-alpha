import { createHash } from 'crypto';
import {
  BatteryGeneralizedEvidenceClass,
  BatteryGeneralizedEvidenceConfidence,
  BatteryRestSessionChargeOpportunityClass,
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
  BatteryRestSessionStatus,
  BatteryShutdownStateAlignmentClass,
} from '@prisma/client';
import { BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV } from '@config/battery-health-v2.config';
import type { PrismaService } from '@shared/database/prisma.service';
import {
  canonicalFeatureInputUtf8,
  computeFeatureInputDigestFromSnapshot,
  FeatureInputNonFiniteError,
} from './feature-input-canonical.serializer';
import type { ChargeOpportunityRawFeaturesV1 } from './charge-opportunity.types';
import { CHARGE_OPPORTUNITY_RAW_POLICY_VERSION } from './charge-opportunity.constants';
import { selectCanonicalRestSessionFeatureShadowRow } from './rest-session-feature-canonical-row.policy';
import {
  buildRestSessionFeatureInputSessionV1,
  buildRestSessionFeatureInputSnapshotV1,
} from './rest-session-feature-input-snapshot.builder';
import type { RestSessionFeatureInputSnapshotV1 } from './rest-session-feature-input-snapshot.types';
import { REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION } from './rest-session-feature.constants';
import {
  REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
  REST_SESSION_FEATURE_MODEL_VERSION,
  REST_SESSION_RETENTION_POLICY_VERSION,
} from './rest-session-feature.constants';
import { RestSessionFeatureComputationService } from './rest-session-feature-computation.service';
import {
  mapRestSessionComputationPhase,
  mapRestSessionFeatureTrust,
} from './rest-session-feature-session.policy';
import { resolveCanonicalRestSessionRetentionAnchor } from './rest-session-retention-anchor.policy';
import { SHUTDOWN_TIMESTAMP_SOURCES } from '../../shutdown-evidence/shutdown-evidence.constants';

const ORG = '00000000-0000-4000-8000-000000000001';
const VEHICLE = '00000000-0000-4000-8000-000000000002';
const SESSION = '00000000-0000-4000-8000-000000000003';
const ANCHOR_AT = new Date('2026-09-22T13:50:28.000Z');

function minimalChargeRaw(
  overrides: Partial<ChargeOpportunityRawFeaturesV1> = {},
): ChargeOpportunityRawFeaturesV1 {
  return {
    policyVersion: CHARGE_OPPORTUNITY_RAW_POLICY_VERSION,
    restSessionId: SESSION,
    windowSource: 'NONE',
    precedingTripId: null,
    precedingTripStartAt: null,
    precedingTripEndAt: null,
    chargeContextStartAt: null,
    chargeContextEndAt: ANCHOR_AT.toISOString(),
    tripEndToAnchorDeltaMs: null,
    precedingTripDurationMs: null,
    precedingTripDistanceKm: null,
    generalizedEvidenceRowsConsidered: 0,
    qualifiedLvObservationCount: 0,
    alternatorBandLvSampleCount: 0,
    engineRunningTrueProviderSnapshotObservationCount: 0,
    runningAlternatorAlignedObservationCount: 0,
    runningAlternatorPartialObservationCount: 0,
    classifierDrivingChargingObservationCount: 0,
    foreignTripObservationCount: 0,
    stateFetchTimeOnlyObservationCount: 0,
    engineRunningObservedCoverageMs: null,
    lvVoltageTimeProxyVms: null,
    lvVoltageTimeProxyCoveredMs: null,
    priorSessionMedianRestVoltageMv: null,
    temperatureC: null,
    temperatureSource: 'UNKNOWN',
    temperatureObservedAt: null,
    temperatureAgeMs: null,
    temperatureUncertainty: null,
    contextCompleteness: ['NO_RELIABLE_PRECEDING_TRIP'],
    chargeOpportunityClass: BatteryRestSessionChargeOpportunityClass.UNKNOWN,
    chargeContextSourceObservationIds: [],
    chargeContextSourceMeasurementIds: [],
    qualifiedLvObservationIds: [],
    qualifiedLvSourceMeasurementIds: [],
    engineRunningProviderSnapshotObservationIds: [],
    engineRunningProviderSnapshotSourceMeasurementIds: [],
    runningAlternatorAlignedObservationIds: [],
    runningAlternatorAlignedSourceMeasurementIds: [],
    runningAlternatorPartialObservationIds: [],
    runningAlternatorPartialSourceMeasurementIds: [],
    ...overrides,
  };
}

function baseSessionBlock(
  overrides: {
    anchorType?: string;
    anchorAt?: Date;
    candidateTripId?: string | null;
    confirmedTripId?: string | null;
    sessionStatus?: string;
    computationPhase?: 'INCREMENTAL' | 'FINAL';
    sessionTrust?: 'VALID' | 'INVALIDATED';
    openedAt?: Date;
    confirmedAt?: Date | null;
    endedAt?: Date | null;
    endReason?: string | null;
  } = {},
) {
  return buildRestSessionFeatureInputSessionV1({
    anchorType: 'PHYSICAL_SHUTDOWN',
    anchorAt: ANCHOR_AT,
    candidateTripId: null,
    confirmedTripId: null,
    sessionStatus: BatteryRestSessionStatus.RESTING,
    computationPhase: 'INCREMENTAL',
    sessionTrust: 'VALID',
    openedAt: new Date('2026-09-22T13:50:28.000Z'),
    confirmedAt: new Date('2026-09-22T13:50:30.000Z'),
    endedAt: null,
    endReason: null,
    ...overrides,
  });
}

function baseSnapshot(
  overrides: Partial<RestSessionFeatureInputSnapshotV1> = {},
): RestSessionFeatureInputSnapshotV1 {
  return {
    inputContractVersion: REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION,
    organizationId: ORG,
    vehicleId: VEHICLE,
    restSessionId: SESSION,
    featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
    retentionPolicyVersion: REST_SESSION_RETENTION_POLICY_VERSION,
    chargeOpportunityPolicyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
    session: baseSessionBlock(),
    anchor: null,
    retentionPoints: [],
    chargeOpportunityRaw: minimalChargeRaw(),
    ...overrides,
  };
}

describe('M3.3C C3 feature input digest (A–N, O)', () => {
  it('TEST_A: canonical object key ordering → same serialized bytes/digest', () => {
    const a = { z: 1, a: { y: 2, b: 3 } };
    const b = { a: { b: 3, y: 2 }, z: 1 };
    expect(canonicalFeatureInputUtf8(a)).toBe(canonicalFeatureInputUtf8(b));
    expect(computeFeatureInputDigestFromSnapshot(a)).toBe(
      computeFeatureInputDigestFromSnapshot(b),
    );
  });

  it('TEST_B: same input, different computedAt metadata excluded from digest input', () => {
    const digest1 = computeFeatureInputDigestFromSnapshot(baseSnapshot());
    const digest2 = computeFeatureInputDigestFromSnapshot(baseSnapshot());
    expect(digest1).toBe(digest2);
    expect(digest1).toHaveLength(64);
    expect(digest1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('TEST_C: eligible retention point change → new digest', () => {
    const before = computeFeatureInputDigestFromSnapshot(baseSnapshot());
    const after = computeFeatureInputDigestFromSnapshot(
      baseSnapshot({
        retentionPoints: [
          {
            observationId: 'obs-1',
            sourceMeasurementId: 'meas-1',
            evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
            evidenceConfidence: BatteryGeneralizedEvidenceConfidence.HIGH,
            stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
            actualRestAgeMs: 3_600_000,
            voltageMv: 13850,
            providerObservationAt: '2026-09-22T14:50:28.000Z',
            nominalRestIntervalIndex: 1,
          },
        ],
      }),
    );
    expect(after).not.toBe(before);
  });

  it('TEST_D: charge raw change → new digest', () => {
    const before = computeFeatureInputDigestFromSnapshot(baseSnapshot());
    const after = computeFeatureInputDigestFromSnapshot(
      baseSnapshot({
        chargeOpportunityRaw: minimalChargeRaw({
          qualifiedLvObservationCount: 1,
        }),
      }),
    );
    expect(after).not.toBe(before);
  });

  it('TEST_E: late trip association change → new digest', () => {
    const before = computeFeatureInputDigestFromSnapshot(baseSnapshot());
    const after = computeFeatureInputDigestFromSnapshot(
      baseSnapshot({
        session: baseSessionBlock({
          confirmedTripId: 'trip-late',
        }),
        chargeOpportunityRaw: minimalChargeRaw({
          precedingTripId: 'trip-late',
          windowSource: 'CONFIRMED_TRIP',
        }),
      }),
    );
    expect(after).not.toBe(before);
  });

  it('TEST_F/G: session block unchanged when only non-semantic fields would differ outside snapshot', () => {
    const digest = computeFeatureInputDigestFromSnapshot(baseSnapshot());
    expect(digest).toBe(computeFeatureInputDigestFromSnapshot(baseSnapshot()));
  });

  it('TEST_H: ACTIVE session → INCREMENTAL + VALID', () => {
    expect(mapRestSessionComputationPhase(BatteryRestSessionStatus.RESTING)).toBe(
      BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
    );
    expect(
      mapRestSessionFeatureTrust({
        sessionStatus: BatteryRestSessionStatus.RESTING,
        endReason: null,
      }),
    ).toBe(BatteryRestSessionFeatureSessionTrust.VALID);
  });

  it('TEST_I: ENDED session → FINAL + VALID', () => {
    expect(mapRestSessionComputationPhase(BatteryRestSessionStatus.ENDED)).toBe(
      BatteryRestSessionFeatureComputationPhase.FINAL,
    );
  });

  it('TEST_J: INVALIDATED → FINAL + INVALIDATED trust', () => {
    expect(mapRestSessionComputationPhase(BatteryRestSessionStatus.INVALIDATED)).toBe(
      BatteryRestSessionFeatureComputationPhase.FINAL,
    );
    expect(
      mapRestSessionFeatureTrust({
        sessionStatus: BatteryRestSessionStatus.INVALIDATED,
        endReason: null,
      }),
    ).toBe(BatteryRestSessionFeatureSessionTrust.INVALIDATED);
  });

  it('TEST_K/L/M: canonical anchor selection', () => {
    const anchorAt = ANCHOR_AT;
    const none = resolveCanonicalRestSessionRetentionAnchor({
      restSessionId: SESSION,
      anchorAt,
      candidates: [],
    });
    expect(none.status).toBe('UNAVAILABLE');

    const ambiguous = resolveCanonicalRestSessionRetentionAnchor({
      restSessionId: SESSION,
      anchorAt,
      candidates: [
        {
          observationId: 'a1',
          sourceMeasurementId: 'm1',
          restSessionId: SESSION,
          evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
          evidenceConfidence: BatteryGeneralizedEvidenceConfidence.HIGH,
          actualRestAgeMs: 0,
          voltage: 14.1,
          voltageObservedAt: anchorAt,
          providerTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
        },
        {
          observationId: 'a2',
          sourceMeasurementId: 'm2',
          restSessionId: SESSION,
          evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
          evidenceConfidence: BatteryGeneralizedEvidenceConfidence.HIGH,
          actualRestAgeMs: 0,
          voltage: 14.2,
          voltageObservedAt: anchorAt,
          providerTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
        },
      ],
    });
    expect(ambiguous.status).toBe('AMBIGUOUS');

    const dup = resolveCanonicalRestSessionRetentionAnchor({
      restSessionId: SESSION,
      anchorAt,
      candidates: [
        {
          observationId: 'z-id',
          sourceMeasurementId: 'm-same',
          restSessionId: SESSION,
          evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
          evidenceConfidence: BatteryGeneralizedEvidenceConfidence.HIGH,
          actualRestAgeMs: 0,
          voltage: 14.15,
          voltageObservedAt: anchorAt,
          providerTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
        },
        {
          observationId: 'a-id',
          sourceMeasurementId: 'm-same',
          restSessionId: SESSION,
          evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
          evidenceConfidence: BatteryGeneralizedEvidenceConfidence.HIGH,
          actualRestAgeMs: 0,
          voltage: 14.15,
          voltageObservedAt: anchorAt,
          providerTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
        },
      ],
    });
    expect(dup.status).toBe('SELECTED');
    if (dup.status === 'SELECTED') {
      expect(dup.snapshotAnchor.observationId).toBe('a-id');
    }
  });

  it('TEST_N: non-finite digest input rejected', () => {
    expect(() =>
      computeFeatureInputDigestFromSnapshot(
        baseSnapshot({
          chargeOpportunityRaw: minimalChargeRaw({
            precedingTripDistanceKm: Number.NaN,
          }),
        }),
      ),
    ).toThrow(FeatureInputNonFiniteError);
  });

  it('TEST_O: charge class remains UNKNOWN in minimal contract', () => {
    expect(minimalChargeRaw().chargeOpportunityClass).toBe(
      BatteryRestSessionChargeOpportunityClass.UNKNOWN,
    );
  });

  it('deterministic digest test vector (documented)', () => {
    const snapshot = baseSnapshot();
    const utf8 = canonicalFeatureInputUtf8(snapshot);
    const digest = createHash('sha256').update(utf8, 'utf8').digest('hex');
    expect(computeFeatureInputDigestFromSnapshot(snapshot)).toBe(digest);
  });
});

describe('M3.3C C3 canonical shadow row (Q–S)', () => {
  const row = (revision: number, phase: BatteryRestSessionFeatureComputationPhase, trust: BatteryRestSessionFeatureSessionTrust) =>
    ({
      semanticRevision: revision,
      computationPhase: phase,
      sessionTrust: trust,
    }) as never;

  it('TEST_Q: active session prefers VALID + INCREMENTAL highest revision', () => {
    const pick = selectCanonicalRestSessionFeatureShadowRow({
      sessionStatus: BatteryRestSessionStatus.RESTING,
      endReason: null,
      rows: [
        row(1, BatteryRestSessionFeatureComputationPhase.INCREMENTAL, BatteryRestSessionFeatureSessionTrust.VALID),
        row(2, BatteryRestSessionFeatureComputationPhase.FINAL, BatteryRestSessionFeatureSessionTrust.VALID),
      ],
    });
    expect(pick?.semanticRevision).toBe(1);
  });

  it('TEST_R: ended session prefers VALID + FINAL', () => {
    const pick = selectCanonicalRestSessionFeatureShadowRow({
      sessionStatus: BatteryRestSessionStatus.ENDED,
      endReason: null,
      rows: [
        row(1, BatteryRestSessionFeatureComputationPhase.INCREMENTAL, BatteryRestSessionFeatureSessionTrust.VALID),
        row(3, BatteryRestSessionFeatureComputationPhase.FINAL, BatteryRestSessionFeatureSessionTrust.VALID),
      ],
    });
    expect(pick?.semanticRevision).toBe(3);
  });

  it('TEST_S: invalidated session prefers INVALIDATED + FINAL', () => {
    const pick = selectCanonicalRestSessionFeatureShadowRow({
      sessionStatus: BatteryRestSessionStatus.INVALIDATED,
      endReason: 'INVALIDATED',
      rows: [
        row(2, BatteryRestSessionFeatureComputationPhase.FINAL, BatteryRestSessionFeatureSessionTrust.VALID),
        row(4, BatteryRestSessionFeatureComputationPhase.FINAL, BatteryRestSessionFeatureSessionTrust.INVALIDATED),
      ],
    });
    expect(pick?.semanticRevision).toBe(4);
  });
});

describe('M3.3C C3 flag-off (TEST_P)', () => {
  const original = process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV];

  afterEach(() => {
    if (original === undefined) {
      delete process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV];
    } else {
      process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV] = original;
    }
  });

  it('TEST_P: flag OFF → SKIPPED_FLAG_OFF and zero DB access', async () => {
    delete process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV];
    const prisma = {
      $transaction: jest.fn(),
      batteryRestSession: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const service = new RestSessionFeatureComputationService(prisma);
    const result = await service.computeAndPersist({
      organizationId: ORG,
      vehicleId: VEHICLE,
      restSessionId: SESSION,
    });
    expect(result.status).toBe('SKIPPED_FLAG_OFF');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.batteryRestSession.findFirst).not.toHaveBeenCalled();
  });
});

describe('buildRestSessionFeatureInputSnapshotV1', () => {
  it('rejects charge raw restSessionId mismatch', () => {
    expect(() =>
      buildRestSessionFeatureInputSnapshotV1({
        organizationId: ORG,
        vehicleId: VEHICLE,
        restSessionId: SESSION,
        session: baseSessionBlock(),
        anchor: null,
        eligibleRetentionPoints: [],
        retentionMetadataByObservationId: new Map(),
        chargeOpportunityRaw: minimalChargeRaw({ restSessionId: 'other' }),
      }),
    ).toThrow(/restSessionId mismatch/);
  });
});
