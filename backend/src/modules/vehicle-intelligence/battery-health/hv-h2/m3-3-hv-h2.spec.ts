import { randomUUID } from 'crypto';
import {
  BatteryEvidenceScope,
  BatteryGroundTruthSourceAuthority,
  BatteryGroundTruthType,
  BatteryGroundTruthVerificationStatus,
  BatteryMeasurementQuality,
} from '@prisma/client';
import { HV_M2_CAPACITY_METHOD } from '../hv-capacity-shadow/hv-capacity-m2.types';
import { HV_M3_CAPACITY_METHOD } from '../hv-capacity-shadow/hv-capacity-m3.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import {
  CROSS_METHOD_POOLING_DEFAULT,
  METHOD_IDENTITY_REQUIRED,
  M3_3_HV_H2_LONGITUDINAL_INPUT_CANDIDATE_V1,
  M3_3_HV_H2_LONGITUDINAL_INPUT_REPORT_V1,
} from './m3-3-hv-h2.constants';
import { buildM3_3HvH2LongitudinalInputReportV1 } from './m3-3-hv-h2-candidate-builder';
import {
  computeM3_3HvH2CandidateFingerprint,
  sortM3_3HvH2Candidates,
} from './m3-3-hv-h2-fingerprint';
import { BatteryEvidenceStrengthTier } from '../battery-v2-domain';
import { HV_M2_MODEL_VERSION } from '../hv-capacity-shadow/hv-capacity-m2.types';
import { HV_M3_MODEL_VERSION } from '../hv-capacity-shadow/hv-capacity-m3.types';
import {
  M3_3_HV_H2_M2_ELIGIBLE_QUALITIES,
  M3_3_HV_H2_M3_ELIGIBLE_QUALITIES,
  M3_3_HV_H2_M2_SUPPORTED_MODEL_VERSION,
  M3_3_HV_H2_M3_SUPPORTED_MODEL_VERSION,
} from './m3-3-hv-h2-eligibility.constants';
import {
  buildM3_3HvH2LifecycleSegments,
  resolveLifecycleSegmentForObservedAt,
  sessionCrossesReplacementBoundary,
} from './m3-3-hv-h2-lifecycle-segmentation';
import { M3_3_HV_H2_METHOD_INVENTORY } from './m3-3-hv-h2-method-inventory';
import type { M3_3HvH2LoadedDataV1 } from './m3-3-hv-h2-loaded-data.types';
import { M3_3_HV_H2_ELIGIBILITY_REASONS } from './m3-3-hv-h2.types';

const orgId = '11111111-1111-4111-8111-111111111111';
const vehId = '22222222-2222-4222-8222-222222222222';
const evaluationAt = new Date('2026-09-30T12:00:00.000Z');

function emptyLoaded(overrides: Partial<M3_3HvH2LoadedDataV1> = {}): M3_3HvH2LoadedDataV1 {
  return {
    organizationId: orgId,
    vehicleId: vehId,
    evaluationAt,
    capacityObservations: [],
    providerSohEvidence: [],
    groundTruthEvents: [],
    sessionsById: new Map(),
    truncated: {
      capacityObservations: false,
      providerSoh: false,
      groundTruth: false,
      sessions: false,
    },
    ...overrides,
  };
}

function qualifiedSession(id: string, start: Date, end: Date) {
  return {
    id,
    organizationId: orgId,
    vehicleId: vehId,
    segmentFingerprint: `fp-${id}`,
    source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
    startAt: start,
    endAt: end,
    isOngoing: false,
    startSocPercent: 20,
    endSocPercent: 80,
    startEnergyKwh: 10,
    endEnergyKwh: 50,
    energyAddedKwh: 40,
    deltaSocPercent: 60,
    idempotencyKey: `idem-${id}`,
    dimoSegmentId: 'seg-1',
    metadata: {
      qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
      capacityValidationEligible: true,
    },
    createdAt: start,
    updatedAt: end,
    providerObservedAt: null,
  };
}

describe('M3.3-HV-H2 contracts', () => {
  it('seals method identity and no cross-method pooling', () => {
    expect(METHOD_IDENTITY_REQUIRED).toBe(true);
    expect(CROSS_METHOD_POOLING_DEFAULT).toBe(false);
    const supported = M3_3_HV_H2_METHOD_INVENTORY.filter((r) => r.supportedNow);
    expect(supported.map((r) => r.h2LogicalMethod)).toEqual(
      expect.arrayContaining(['M2_CURRENT_ENERGY_SOC', 'M3_ADDED_ENERGY_DELTA_SOC', 'PROVIDER_HV_SOH']),
    );
  });
});

describe('M3.3-HV-H2 lifecycle segmentation', () => {
  const replacementAt = new Date('2026-06-01T00:00:00.000Z');
  const boundaries = [{ effectiveAt: replacementAt, groundTruthEventId: 'gt-1' }];

  it('assigns pre/post replacement segments using effectiveAt', () => {
    const before = resolveLifecycleSegmentForObservedAt({
      observedAt: new Date('2026-05-01T00:00:00.000Z'),
      replacementBoundaries: boundaries,
    });
    expect(before.lifecycleSegmentId).toBe('HV_SEGMENT_0');
    expect(before.onReplacementEffectiveAt).toBe(false);

    const after = resolveLifecycleSegmentForObservedAt({
      observedAt: new Date('2026-07-01T00:00:00.000Z'),
      replacementBoundaries: boundaries,
    });
    expect(after.lifecycleSegmentId).toBe('HV_SEGMENT_1');
  });

  it('flags exact replacement effectiveAt as boundary intersection', () => {
    const on = resolveLifecycleSegmentForObservedAt({
      observedAt: replacementAt,
      replacementBoundaries: boundaries,
    });
    expect(on.onReplacementEffectiveAt).toBe(true);
  });

  it('detects session crossing replacement (inclusive boundaries)', () => {
    expect(
      sessionCrossesReplacementBoundary({
        sessionStartAt: new Date('2026-05-31T00:00:00.000Z'),
        sessionEndAt: new Date('2026-06-02T00:00:00.000Z'),
        replacementBoundaries: boundaries,
      }),
    ).toBe(true);
    expect(
      sessionCrossesReplacementBoundary({
        sessionStartAt: replacementAt,
        sessionEndAt: new Date('2026-06-02T00:00:00.000Z'),
        replacementBoundaries: boundaries,
      }),
    ).toBe(true);
    expect(
      sessionCrossesReplacementBoundary({
        sessionStartAt: new Date('2026-05-31T00:00:00.000Z'),
        sessionEndAt: replacementAt,
        replacementBoundaries: boundaries,
      }),
    ).toBe(true);
    expect(
      sessionCrossesReplacementBoundary({
        sessionStartAt: new Date('2026-06-02T00:00:00.000Z'),
        sessionEndAt: new Date('2026-06-03T00:00:00.000Z'),
        replacementBoundaries: boundaries,
      }),
    ).toBe(false);
  });

  it('builds HV_SEGMENT_n segments for multiple replacements', () => {
    const segments = buildM3_3HvH2LifecycleSegments([
      { effectiveAt: new Date('2026-01-01T00:00:00.000Z'), groundTruthEventId: 'a' },
      { effectiveAt: new Date('2026-06-01T00:00:00.000Z'), groundTruthEventId: 'b' },
    ]);
    expect(segments).toHaveLength(3);
    expect(segments.map((s) => s.lifecycleSegmentId)).toEqual([
      'HV_SEGMENT_0',
      'HV_SEGMENT_1',
      'HV_SEGMENT_2',
    ]);
  });
});

describe('M3.3-HV-H2 candidate builder', () => {
  it('builds eligible M2 candidate from qualified session observation', () => {
    const sessionId = randomUUID();
    const session = qualifiedSession(
      sessionId,
      new Date('2026-09-20T08:00:00.000Z'),
      new Date('2026-09-20T10:00:00.000Z'),
    );
    const report = buildM3_3HvH2LongitudinalInputReportV1(
      emptyLoaded({
        capacityObservations: [
          {
            id: randomUUID(),
            organizationId: orgId,
            vehicleId: vehId,
            method: HV_M2_CAPACITY_METHOD,
            observedAt: new Date('2026-09-20T09:00:00.000Z'),
            receivedAt: new Date('2026-09-20T09:01:00.000Z'),
            idempotencyKey: 'm2-1',
            quality: BatteryMeasurementQuality.SHADOW,
            modelVersion: 1,
            estimatedCapacityKwh: 58.2,
            chargeSessionId: sessionId,
            referenceCapacityKwh: 60,
            estimatedSohPct: null,
            deltaSocPercent: null,
            deltaEnergyKwh: null,
            metadata: { outlier: false, gateReasonCodes: [] },
            createdAt: new Date(),
          } as never,
        ],
        sessionsById: new Map([[sessionId, session as never]]),
      }),
    );
    expect(report.candidates).toHaveLength(1);
    const c = report.candidates[0]!;
    expect(c.contractVersion).toBe(M3_3_HV_H2_LONGITUDINAL_INPUT_CANDIDATE_V1);
    expect(c.method).toBe('M2_CURRENT_ENERGY_SOC');
    expect(c.methodRole).toBe('METHOD_SHADOW_EVIDENCE');
    expect(c.valueSemantic).toBe('ESTIMATED_USABLE_CAPACITY_KWH');
    expect(c.numericValue).toBe(58.2);
    expect(c.sourceEntityId).toBeTruthy();
    expect(c.candidateFingerprint).toHaveLength(64);
    expect(c.eligibility).toBe('eligible');
    expect(c.evidenceStrength).toBe(BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_PROVISIONAL);
  });

  it('marks M2 outlier ineligible', () => {
    const report = buildM3_3HvH2LongitudinalInputReportV1(
      emptyLoaded({
        capacityObservations: [
          {
            id: randomUUID(),
            organizationId: orgId,
            vehicleId: vehId,
            method: HV_M2_CAPACITY_METHOD,
            observedAt: new Date('2026-09-20T09:00:00.000Z'),
            receivedAt: new Date('2026-09-20T09:01:00.000Z'),
            idempotencyKey: 'm2-out',
            quality: BatteryMeasurementQuality.SHADOW,
            modelVersion: 1,
            estimatedCapacityKwh: 58,
            chargeSessionId: null,
            referenceCapacityKwh: null,
            estimatedSohPct: null,
            deltaSocPercent: null,
            deltaEnergyKwh: null,
            metadata: { outlier: true, gateReasonCodes: [] },
            createdAt: new Date(),
          } as never,
        ],
      }),
    );
    expect(report.candidates[0]?.eligibility).toBe('ineligible');
    expect(report.candidates[0]?.reasonCodes).toContain(M3_3_HV_H2_ELIGIBILITY_REASONS.M2_OUTLIER);
  });

  it('marks M3 with VALIDATION_ONLY role and method conflict ineligible', () => {
    const sessionId = randomUUID();
    const session = qualifiedSession(
      sessionId,
      new Date('2026-09-19T08:00:00.000Z'),
      new Date('2026-09-19T10:00:00.000Z'),
    );
    const report = buildM3_3HvH2LongitudinalInputReportV1(
      emptyLoaded({
        capacityObservations: [
          {
            id: randomUUID(),
            organizationId: orgId,
            vehicleId: vehId,
            method: HV_M3_CAPACITY_METHOD,
            observedAt: new Date('2026-09-19T09:00:00.000Z'),
            receivedAt: new Date('2026-09-19T09:01:00.000Z'),
            idempotencyKey: 'm3-1',
            quality: BatteryMeasurementQuality.VALID_PROXY,
            modelVersion: 1,
            estimatedCapacityKwh: 57,
            chargeSessionId: sessionId,
            referenceCapacityKwh: 60,
            estimatedSohPct: null,
            deltaSocPercent: 55,
            deltaEnergyKwh: 30,
            metadata: { methodConflict: true, gateReasonCodes: [] },
            createdAt: new Date(),
          } as never,
        ],
        sessionsById: new Map([[sessionId, session as never]]),
      }),
    );
    const m3 = report.candidates.find((c) => c.method === 'M3_ADDED_ENERGY_DELTA_SOC');
    expect(m3?.methodRole).toBe('VALIDATION_ONLY');
    expect(m3?.eligibility).toBe('ineligible');
    expect(m3?.reasonCodes).toContain(M3_3_HV_H2_ELIGIBILITY_REASONS.M3_METHOD_CONFLICT);
  });

  it('maps provider SOH from BatteryEvidence semantics', () => {
    const report = buildM3_3HvH2LongitudinalInputReportV1(
      emptyLoaded({
        providerSohEvidence: [
          {
            id: randomUUID(),
            vehicleId: vehId,
            measurementId: null,
            scope: BatteryEvidenceScope.HV,
            sourceType: 'PROVIDER_REPORTED',
            valueType: 'SOH_PERCENT',
            numericValue: 92.5,
            unit: 'percent',
            observedAt: new Date('2026-08-01T00:00:00.000Z'),
            provider: 'DIMO',
            confidence: null,
            quality: 'QUALIFIED',
            documentExtractionId: null,
            serviceEventId: null,
            metadataJson: null,
            createdAt: new Date('2026-08-01T00:05:00.000Z'),
          },
        ],
      }),
    );
    const soh = report.candidates[0]!;
    expect(soh.method).toBe('PROVIDER_HV_SOH');
    expect(soh.valueSemantic).toBe('PROVIDER_SOH_PERCENT');
    expect(soh.eligibility).toBe('eligible');
    expect(soh.receivedAt).toBeNull();
    expect(soh.persistedAt).toBeTruthy();
    expect(soh.modelVersion).toBeNull();
    expect(soh.evidenceStrength).toBe(BatteryEvidenceStrengthTier.PROVIDER_OEM_SOH);
    expect(report.summary.providerSohLongitudinalReady).toBe(true);
  });

  it('rejects invalid provider SOH range', () => {
    const report = buildM3_3HvH2LongitudinalInputReportV1(
      emptyLoaded({
        providerSohEvidence: [
          {
            id: randomUUID(),
            vehicleId: vehId,
            measurementId: null,
            scope: BatteryEvidenceScope.HV,
            sourceType: 'PROVIDER_REPORTED',
            valueType: 'SOH_PERCENT',
            numericValue: 150,
            unit: 'percent',
            observedAt: new Date('2026-08-01T00:00:00.000Z'),
            provider: 'DIMO',
            confidence: null,
            quality: null,
            documentExtractionId: null,
            serviceEventId: null,
            metadataJson: null,
            createdAt: new Date(),
          },
        ],
      }),
    );
    expect(report.candidates[0]?.reasonCodes).toContain(
      M3_3_HV_H2_ELIGIBILITY_REASONS.PROVIDER_SOH_RANGE_INVALID,
    );
  });

  it('retains stale-but-valid historical points (freshness separate from eligibility)', () => {
    const report = buildM3_3HvH2LongitudinalInputReportV1(
      emptyLoaded({
        providerSohEvidence: [
          {
            id: randomUUID(),
            vehicleId: vehId,
            measurementId: null,
            scope: BatteryEvidenceScope.HV,
            sourceType: 'PROVIDER_REPORTED',
            valueType: 'SOH_PERCENT',
            numericValue: 88,
            unit: 'percent',
            observedAt: new Date('2025-01-01T00:00:00.000Z'),
            provider: 'DIMO',
            confidence: null,
            quality: null,
            documentExtractionId: null,
            serviceEventId: null,
            metadataJson: null,
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
          },
        ],
      }),
    );
    const c = report.candidates[0]!;
    expect(c.eligibility).toBe('eligible');
    expect(c.currentDecisionFreshness).toBe('STALE');
    expect(c.observationValidity).toBe('VALID');
  });

  it('splits lifecycle at HV replacement GT and blocks session crossing boundary', () => {
    const sessionId = randomUUID();
    const replacementAt = new Date('2026-06-01T12:00:00.000Z');
    const session = qualifiedSession(
      sessionId,
      new Date('2026-05-31T00:00:00.000Z'),
      new Date('2026-06-02T00:00:00.000Z'),
    );
    const report = buildM3_3HvH2LongitudinalInputReportV1(
      emptyLoaded({
        groundTruthEvents: [
          {
            id: 'gt-repl',
            organizationId: orgId,
            vehicleId: vehId,
            groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
            batteryScope: BatteryEvidenceScope.HV,
            effectiveAt: replacementAt,
            sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
            verificationStatus: BatteryGroundTruthVerificationStatus.CONFIRMED,
            sourceServiceEventId: randomUUID(),
            sourceDocumentExtractionId: null,
            sourceBatteryEvidenceId: null,
            sourceMeasurementId: null,
            sourceContentFingerprint: 'a'.repeat(64),
            confirmedByUserId: null,
            confirmedAt: null,
            supersedesGroundTruthEventId: null,
            createdAt: replacementAt,
            revocations: [],
            supersededByGroundTruthEvents: [],
          },
        ],
        capacityObservations: [
          {
            id: randomUUID(),
            organizationId: orgId,
            vehicleId: vehId,
            method: HV_M2_CAPACITY_METHOD,
            observedAt: new Date('2026-05-01T00:00:00.000Z'),
            receivedAt: new Date('2026-09-20T09:01:00.000Z'),
            idempotencyKey: 'pre',
            quality: BatteryMeasurementQuality.SHADOW,
            modelVersion: 1,
            estimatedCapacityKwh: 50,
            chargeSessionId: null,
            referenceCapacityKwh: null,
            estimatedSohPct: null,
            deltaSocPercent: null,
            deltaEnergyKwh: null,
            metadata: {},
            createdAt: new Date(),
          } as never,
          {
            id: randomUUID(),
            organizationId: orgId,
            vehicleId: vehId,
            method: HV_M2_CAPACITY_METHOD,
            observedAt: new Date('2026-07-01T00:00:00.000Z'),
            receivedAt: new Date('2026-09-20T09:01:00.000Z'),
            idempotencyKey: 'post',
            quality: BatteryMeasurementQuality.SHADOW,
            modelVersion: 1,
            estimatedCapacityKwh: 60,
            chargeSessionId: sessionId,
            referenceCapacityKwh: null,
            estimatedSohPct: null,
            deltaSocPercent: null,
            deltaEnergyKwh: null,
            metadata: {},
            createdAt: new Date(),
          } as never,
        ],
        sessionsById: new Map([[sessionId, session as never]]),
      }),
    );
    expect(report.summary.replacementBoundaryCount).toBe(1);
    expect(report.validationAnchors).toHaveLength(1);
    const segments = new Set(report.candidates.map((c) => c.lifecycleSegmentId));
    expect(segments.has('HV_SEGMENT_0')).toBe(true);
    expect(segments.has('HV_SEGMENT_1')).toBe(true);
    const crossing = report.candidates.find((c) => c.sessionId === sessionId);
    expect(crossing?.reasonCodes).toContain(
      M3_3_HV_H2_ELIGIBILITY_REASONS.INTERVENTION_BOUNDARY_INTERSECTION,
    );
  });

  it('ignores LV GT for HV lifecycle segmentation', () => {
    const report = buildM3_3HvH2LongitudinalInputReportV1(
      emptyLoaded({
        groundTruthEvents: [
          {
            id: 'gt-lv',
            organizationId: orgId,
            vehicleId: vehId,
            groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
            batteryScope: BatteryEvidenceScope.LV,
            effectiveAt: new Date('2026-06-01T00:00:00.000Z'),
            sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
            verificationStatus: BatteryGroundTruthVerificationStatus.CONFIRMED,
            sourceServiceEventId: randomUUID(),
            sourceDocumentExtractionId: null,
            sourceBatteryEvidenceId: null,
            sourceMeasurementId: null,
            sourceContentFingerprint: 'b'.repeat(64),
            confirmedByUserId: null,
            confirmedAt: null,
            supersedesGroundTruthEventId: null,
            createdAt: new Date(),
            revocations: [],
            supersededByGroundTruthEvents: [],
          },
        ],
      }),
    );
    expect(report.summary.replacementBoundaryCount).toBe(0);
    expect(report.lifecycleSegments).toHaveLength(1);
  });

  it('does not pool methods — distinct candidates at same timestamp', () => {
    const sessionId = randomUUID();
    const session = qualifiedSession(
      sessionId,
      new Date('2026-09-20T08:00:00.000Z'),
      new Date('2026-09-20T10:00:00.000Z'),
    );
    const at = new Date('2026-09-20T09:00:00.000Z');
    const report = buildM3_3HvH2LongitudinalInputReportV1(
      emptyLoaded({
        capacityObservations: [
          {
            id: 'obs-m2',
            organizationId: orgId,
            vehicleId: vehId,
            method: HV_M2_CAPACITY_METHOD,
            observedAt: at,
            receivedAt: new Date('2026-09-20T09:01:00.000Z'),
            idempotencyKey: 'both-m2',
            quality: BatteryMeasurementQuality.SHADOW,
            modelVersion: 1,
            estimatedCapacityKwh: 58,
            chargeSessionId: sessionId,
            referenceCapacityKwh: null,
            estimatedSohPct: null,
            deltaSocPercent: null,
            deltaEnergyKwh: null,
            metadata: {},
            createdAt: new Date(),
          } as never,
          {
            id: 'obs-m3',
            organizationId: orgId,
            vehicleId: vehId,
            method: HV_M3_CAPACITY_METHOD,
            observedAt: at,
            receivedAt: at,
            idempotencyKey: 'both-m3',
            quality: BatteryMeasurementQuality.VALID_PROXY,
            modelVersion: 1,
            estimatedCapacityKwh: 57,
            chargeSessionId: sessionId,
            referenceCapacityKwh: null,
            estimatedSohPct: null,
            deltaSocPercent: 60,
            deltaEnergyKwh: 35,
            metadata: {},
            createdAt: new Date(),
          } as never,
        ],
        providerSohEvidence: [
          {
            id: 'ev-soh',
            vehicleId: vehId,
            measurementId: null,
            scope: BatteryEvidenceScope.HV,
            sourceType: 'PROVIDER_REPORTED',
            valueType: 'SOH_PERCENT',
            numericValue: 90,
            unit: 'percent',
            observedAt: at,
            provider: 'DIMO',
            confidence: null,
            quality: null,
            documentExtractionId: null,
            serviceEventId: null,
            metadataJson: null,
            createdAt: at,
          },
        ],
        sessionsById: new Map([[sessionId, session as never]]),
      }),
    );
    expect(report.candidates).toHaveLength(3);
    expect(new Set(report.candidates.map((c) => c.method)).size).toBe(3);
    expect(report.crossMethodPoolingDefault).toBe(false);
  });

  it('rejects unsupported M2 model version', () => {
    const report = buildM3_3HvH2LongitudinalInputReportV1(
      emptyLoaded({
        capacityObservations: [
          {
            id: randomUUID(),
            organizationId: orgId,
            vehicleId: vehId,
            method: HV_M2_CAPACITY_METHOD,
            observedAt: new Date('2026-09-20T09:00:00.000Z'),
            receivedAt: new Date('2026-09-20T09:01:00.000Z'),
            idempotencyKey: 'm2-bad-ver',
            quality: BatteryMeasurementQuality.SHADOW,
            modelVersion: HV_M2_MODEL_VERSION + 1,
            estimatedCapacityKwh: 58,
            chargeSessionId: null,
            referenceCapacityKwh: null,
            estimatedSohPct: null,
            deltaSocPercent: null,
            deltaEnergyKwh: null,
            metadata: {},
            createdAt: new Date(),
          } as never,
        ],
      }),
    );
    expect(report.candidates[0]?.reasonCodes).toContain(
      M3_3_HV_H2_ELIGIBILITY_REASONS.MODEL_VERSION_UNSUPPORTED,
    );
  });

  it('rejects unexpected M2 quality (fail closed whitelist)', () => {
    const report = buildM3_3HvH2LongitudinalInputReportV1(
      emptyLoaded({
        capacityObservations: [
          {
            id: randomUUID(),
            organizationId: orgId,
            vehicleId: vehId,
            method: HV_M2_CAPACITY_METHOD,
            observedAt: new Date('2026-09-20T09:00:00.000Z'),
            receivedAt: new Date('2026-09-20T09:01:00.000Z'),
            idempotencyKey: 'm2-stale-q',
            quality: BatteryMeasurementQuality.STALE,
            modelVersion: HV_M2_MODEL_VERSION,
            estimatedCapacityKwh: 58,
            chargeSessionId: null,
            referenceCapacityKwh: null,
            estimatedSohPct: null,
            deltaSocPercent: null,
            deltaEnergyKwh: null,
            metadata: {},
            createdAt: new Date(),
          } as never,
        ],
      }),
    );
    expect(report.candidates[0]?.eligibility).toBe('ineligible');
    expect(M3_3_HV_H2_M2_ELIGIBLE_QUALITIES).toEqual([BatteryMeasurementQuality.SHADOW]);
  });

  it('never emits NaN in JSON report output', () => {
    const report = buildM3_3HvH2LongitudinalInputReportV1(
      emptyLoaded({
        capacityObservations: [
          {
            id: randomUUID(),
            organizationId: orgId,
            vehicleId: vehId,
            method: HV_M2_CAPACITY_METHOD,
            observedAt: new Date('2026-09-20T09:00:00.000Z'),
            receivedAt: new Date('2026-09-20T09:01:00.000Z'),
            idempotencyKey: 'm2-missing-val',
            quality: BatteryMeasurementQuality.SHADOW,
            modelVersion: HV_M2_MODEL_VERSION,
            estimatedCapacityKwh: null,
            chargeSessionId: null,
            referenceCapacityKwh: null,
            estimatedSohPct: null,
            deltaSocPercent: null,
            deltaEnergyKwh: null,
            metadata: {},
            createdAt: new Date(),
          } as never,
        ],
      }),
    );
    const json = JSON.stringify(report);
    expect(json).not.toContain('NaN');
    expect(report.candidates[0]?.numericValue).toBeNull();
  });

  it('ignores GT not knowable by evaluationAt for replacement segmentation', () => {
    const report = buildM3_3HvH2LongitudinalInputReportV1(
      emptyLoaded({
        evaluationAt: new Date('2026-06-15T12:00:00.000Z'),
        groundTruthEvents: [
          {
            id: 'gt-future-knowledge',
            organizationId: orgId,
            vehicleId: vehId,
            groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
            batteryScope: BatteryEvidenceScope.HV,
            effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
            sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
            verificationStatus: BatteryGroundTruthVerificationStatus.CONFIRMED,
            sourceServiceEventId: randomUUID(),
            sourceDocumentExtractionId: null,
            sourceBatteryEvidenceId: null,
            sourceMeasurementId: null,
            sourceContentFingerprint: 'e'.repeat(64),
            confirmedByUserId: null,
            confirmedAt: null,
            supersedesGroundTruthEventId: null,
            createdAt: new Date('2026-09-01T00:00:00.000Z'),
            revocations: [],
            supersededByGroundTruthEvents: [],
          },
        ],
      }),
    );
    expect(report.summary.replacementBoundaryCount).toBe(0);
  });
});

describe('M3.3-HV-H2 fingerprint and ordering', () => {
  it('produces stable SHA-256 fingerprint', () => {
    const input = {
      organizationId: orgId,
      vehicleId: vehId,
      batteryScope: 'HV',
      method: 'M2_CURRENT_ENERGY_SOC',
      sourceEntityType: 'HvCapacityObservation',
      sourceEntityId: 'obs-1',
      observedAt: '2026-09-01T00:00:00.000Z',
      modelVersion: 1,
      valueSemantic: 'ESTIMATED_USABLE_CAPACITY_KWH',
      lifecycleSegmentId: 'HV_SEGMENT_0',
    };
    expect(computeM3_3HvH2CandidateFingerprint({ ...input, modelVersion: null })).toHaveLength(64);
  });

  it('orders lifecycle segments numerically (HV_SEGMENT_2 before HV_SEGMENT_10)', () => {
    const ordered = sortM3_3HvH2Candidates([
      {
        lifecycleSegmentId: 'HV_SEGMENT_10',
        observedAt: '2026-01-02T00:00:00.000Z',
        method: 'M2_CURRENT_ENERGY_SOC',
        sourceEntityId: 'z',
      } as never,
      {
        lifecycleSegmentId: 'HV_SEGMENT_2',
        observedAt: '2026-01-03T00:00:00.000Z',
        method: 'M2_CURRENT_ENERGY_SOC',
        sourceEntityId: 'a',
      } as never,
      {
        lifecycleSegmentId: 'HV_SEGMENT_0',
        observedAt: '2026-01-04T00:00:00.000Z',
        method: 'PROVIDER_HV_SOH',
        sourceEntityId: 'b',
      } as never,
    ]);
    expect(ordered.map((c) => c.lifecycleSegmentId)).toEqual([
      'HV_SEGMENT_0',
      'HV_SEGMENT_2',
      'HV_SEGMENT_10',
    ]);
  });

  it('orders eleven-plus segment indices in numeric order', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `HV_SEGMENT_${i}`);
    const shuffled = [...ids].reverse();
    const ordered = sortM3_3HvH2Candidates(
      shuffled.map((lifecycleSegmentId, i) => ({
        lifecycleSegmentId,
        observedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
        method: 'M2_CURRENT_ENERGY_SOC',
        sourceEntityId: `id-${i}`,
      })) as never,
    );
    expect(ordered.map((c) => c.lifecycleSegmentId)).toEqual(ids);
  });
});

describe('M3.3-HV-H2 M2 session linkage', () => {
  it('marks M2 SHADOW with null chargeSessionId ineligible with SESSION_MISSING', () => {
    const report = buildM3_3HvH2LongitudinalInputReportV1(
      emptyLoaded({
        capacityObservations: [
          {
            id: randomUUID(),
            organizationId: orgId,
            vehicleId: vehId,
            method: HV_M2_CAPACITY_METHOD,
            observedAt: new Date('2026-09-20T09:00:00.000Z'),
            receivedAt: new Date('2026-09-20T09:01:00.000Z'),
            idempotencyKey: 'm2-no-session',
            quality: BatteryMeasurementQuality.SHADOW,
            modelVersion: HV_M2_MODEL_VERSION,
            estimatedCapacityKwh: 58,
            chargeSessionId: null,
            referenceCapacityKwh: null,
            estimatedSohPct: null,
            deltaSocPercent: null,
            deltaEnergyKwh: null,
            metadata: { outlier: false, gateReasonCodes: [] },
            createdAt: new Date(),
          } as never,
        ],
      }),
    );
    const m2 = report.candidates.find((c) => c.method === 'M2_CURRENT_ENERGY_SOC');
    expect(m2?.eligibility).toBe('ineligible');
    expect(m2?.reasonCodes).toContain(M3_3_HV_H2_ELIGIBILITY_REASONS.SESSION_MISSING);
  });
});

describe('M3.3-HV-H2 GT validation anchor as-of status', () => {
  it('projects CONFIRMED as-of status when DB row is REVOKED after evaluationAt', () => {
    const report = buildM3_3HvH2LongitudinalInputReportV1(
      emptyLoaded({
        evaluationAt: new Date('2026-06-15T12:00:00.000Z'),
        groundTruthEvents: [
          {
            id: 'gt-revoked-later',
            organizationId: orgId,
            vehicleId: vehId,
            groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
            batteryScope: BatteryEvidenceScope.HV,
            effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
            sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
            verificationStatus: BatteryGroundTruthVerificationStatus.REVOKED,
            sourceServiceEventId: randomUUID(),
            sourceDocumentExtractionId: null,
            sourceBatteryEvidenceId: null,
            sourceMeasurementId: null,
            sourceContentFingerprint: 'f'.repeat(64),
            confirmedByUserId: null,
            confirmedAt: null,
            supersedesGroundTruthEventId: null,
            createdAt: new Date('2026-01-02T00:00:00.000Z'),
            revocations: [{ revokedAt: new Date('2026-08-01T00:00:00.000Z') } as never],
            supersededByGroundTruthEvents: [],
          },
        ],
      }),
    );
    expect(report.validationAnchors).toHaveLength(1);
    const anchor = report.validationAnchors[0]!;
    expect(anchor.verificationStatus).toBe(BatteryGroundTruthVerificationStatus.CONFIRMED);
    expect(anchor.verificationStatusAtEvaluationAt).toBe(
      BatteryGroundTruthVerificationStatus.CONFIRMED,
    );
    expect(anchor.currentVerificationStatus).toBe(
      BatteryGroundTruthVerificationStatus.REVOKED,
    );
  });

  it('projects CONFIRMED as-of status when DB row is SUPERSEDED after evaluationAt', () => {
    const report = buildM3_3HvH2LongitudinalInputReportV1(
      emptyLoaded({
        evaluationAt: new Date('2026-06-15T12:00:00.000Z'),
        groundTruthEvents: [
          {
            id: 'gt-superseded-later',
            organizationId: orgId,
            vehicleId: vehId,
            groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
            batteryScope: BatteryEvidenceScope.HV,
            effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
            sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
            verificationStatus: BatteryGroundTruthVerificationStatus.SUPERSEDED,
            sourceServiceEventId: randomUUID(),
            sourceDocumentExtractionId: null,
            sourceBatteryEvidenceId: null,
            sourceMeasurementId: null,
            sourceContentFingerprint: 'g'.repeat(64),
            confirmedByUserId: null,
            confirmedAt: null,
            supersedesGroundTruthEventId: null,
            createdAt: new Date('2026-01-02T00:00:00.000Z'),
            revocations: [],
            supersededByGroundTruthEvents: [{ id: 'gt-new', createdAt: new Date('2026-09-01T00:00:00.000Z') }],
          },
        ],
      }),
    );
    expect(report.validationAnchors[0]?.verificationStatus).toBe(
      BatteryGroundTruthVerificationStatus.CONFIRMED,
    );
    expect(report.validationAnchors[0]?.currentVerificationStatus).toBe(
      BatteryGroundTruthVerificationStatus.SUPERSEDED,
    );
  });
});

describe('M3.3-HV-H2 session evaluation-at safety', () => {
  it('does not treat a session completed after evaluationAt as eligible', () => {
    const sessionId = randomUUID();
    const evalDuring = new Date('2026-09-19T09:00:00.000Z');
    const session = qualifiedSession(
      sessionId,
      new Date('2026-09-19T08:00:00.000Z'),
      new Date('2026-09-19T10:00:00.000Z'),
    );
    session.updatedAt = new Date('2026-09-19T10:00:00.000Z');
    const report = buildM3_3HvH2LongitudinalInputReportV1(
      emptyLoaded({
        evaluationAt: evalDuring,
        capacityObservations: [
          {
            id: randomUUID(),
            organizationId: orgId,
            vehicleId: vehId,
            method: HV_M2_CAPACITY_METHOD,
            observedAt: evalDuring,
            receivedAt: evalDuring,
            idempotencyKey: 'm2-mid-session',
            quality: BatteryMeasurementQuality.SHADOW,
            modelVersion: HV_M2_MODEL_VERSION,
            estimatedCapacityKwh: 58,
            chargeSessionId: sessionId,
            referenceCapacityKwh: null,
            estimatedSohPct: null,
            deltaSocPercent: null,
            deltaEnergyKwh: null,
            metadata: {},
            createdAt: evalDuring,
          } as never,
        ],
        sessionsById: new Map([[sessionId, session as never]]),
      }),
    );
    const m2 = report.candidates[0];
    expect(m2?.eligibility).toBe('ineligible');
    expect(m2?.reasonCodes).toContain(M3_3_HV_H2_ELIGIBILITY_REASONS.SESSION_ONGOING);
  });

  it('fails closed when session qualification updated after evaluationAt', () => {
    const sessionId = randomUUID();
    const evaluationAtLocal = new Date('2026-09-19T09:00:00.000Z');
    const session = qualifiedSession(
      sessionId,
      new Date('2026-09-19T08:00:00.000Z'),
      new Date('2026-09-19T08:30:00.000Z'),
    );
    session.updatedAt = new Date('2026-09-30T12:00:00.000Z');
    const report = buildM3_3HvH2LongitudinalInputReportV1(
      emptyLoaded({
        evaluationAt: evaluationAtLocal,
        capacityObservations: [
          {
            id: randomUUID(),
            organizationId: orgId,
            vehicleId: vehId,
            method: HV_M2_CAPACITY_METHOD,
            observedAt: evaluationAtLocal,
            receivedAt: evaluationAtLocal,
            idempotencyKey: 'm2-future-session-state',
            quality: BatteryMeasurementQuality.SHADOW,
            modelVersion: HV_M2_MODEL_VERSION,
            estimatedCapacityKwh: 58,
            chargeSessionId: sessionId,
            referenceCapacityKwh: null,
            estimatedSohPct: null,
            deltaSocPercent: null,
            deltaEnergyKwh: null,
            metadata: {},
            createdAt: evaluationAtLocal,
          } as never,
        ],
        sessionsById: new Map([[sessionId, session as never]]),
      }),
    );
    expect(report.candidates[0]?.reasonCodes).toContain(
      M3_3_HV_H2_ELIGIBILITY_REASONS.SESSION_STATE_NOT_KNOWABLE_AT_EVALUATION_AT,
    );
  });

  it('allows eligible session when end and updatedAt are knowable by evaluationAt', () => {
    const sessionId = randomUUID();
    const evaluationAtLocal = new Date('2026-09-30T12:00:00.000Z');
    const session = qualifiedSession(
      sessionId,
      new Date('2026-09-19T08:00:00.000Z'),
      new Date('2026-09-19T10:00:00.000Z'),
    );
    session.updatedAt = new Date('2026-09-19T10:00:00.000Z');
    const report = buildM3_3HvH2LongitudinalInputReportV1(
      emptyLoaded({
        evaluationAt: evaluationAtLocal,
        capacityObservations: [
          {
            id: randomUUID(),
            organizationId: orgId,
            vehicleId: vehId,
            method: HV_M2_CAPACITY_METHOD,
            observedAt: new Date('2026-09-19T09:00:00.000Z'),
            receivedAt: new Date('2026-09-19T09:01:00.000Z'),
            idempotencyKey: 'm2-historical-ok',
            quality: BatteryMeasurementQuality.SHADOW,
            modelVersion: HV_M2_MODEL_VERSION,
            estimatedCapacityKwh: 58,
            chargeSessionId: sessionId,
            referenceCapacityKwh: null,
            estimatedSohPct: null,
            deltaSocPercent: null,
            deltaEnergyKwh: null,
            metadata: {},
            createdAt: new Date('2026-09-19T09:00:00.000Z'),
          } as never,
        ],
        sessionsById: new Map([[sessionId, session as never]]),
      }),
    );
    expect(report.candidates[0]?.eligibility).toBe('eligible');
  });
});

describe('M3.3-HV-H2 report temporal semantics', () => {
  it('documents observation/GT/session temporal authority separately', () => {
    const report = buildM3_3HvH2LongitudinalInputReportV1(emptyLoaded());
    expect(report.temporalSemantics).toContain('OBSERVATION_EVENT_TIME_FILTERED');
    expect(report.temporalSemantics).toContain('GT_KNOWLEDGE_AS_OF');
    expect(report.temporalSemantics).toContain('SESSION_CONTEXT_CURRENT_OR_FAIL_CLOSED');
  });
});
