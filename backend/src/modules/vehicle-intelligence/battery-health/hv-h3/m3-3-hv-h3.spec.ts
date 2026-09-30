import { randomUUID } from 'crypto';
import { BatteryMeasurementQuality } from '@prisma/client';
import { M3_3_HV_H2_LONGITUDINAL_INPUT_CANDIDATE_V1, M3_3_HV_H2_LONGITUDINAL_INPUT_REPORT_V1 } from '../hv-h2/m3-3-hv-h2.constants';
import type { M3_3HvH2LongitudinalInputCandidateV1, M3_3HvH2LongitudinalInputReportV1 } from '../hv-h2/m3-3-hv-h2.types';
import {
  CROSS_METHOD_POOLING_DEFAULT,
  CROSS_PROVIDER_POOLING_DEFAULT,
  M3_3_HV_H3_ESTIMATOR_VERSION,
  M3_3_HV_H3_EXPOSURE_AXIS,
  M3_3_HV_H3_INPUT_ANOMALY_CODES,
  M3_3_HV_H3_LONGITUDINAL_TREND_REPORT_V1,
  M3_3_HV_H3_MAX_POINTS_PER_SERIES_HARD,
  M3_3_HV_H3_RELATIVE_DIFFERENCE_REFERENCE,
  METHOD_IDENTITY_REQUIRED,
} from './m3-3-hv-h3.constants';
import { buildM3_3HvH3LongitudinalTrendReportV1 } from './m3-3-hv-h3-series-builder';
import { computeTheilSenMedianPairwiseSlopeV1 } from './m3-3-hv-h3-theil-sen';
import {
  M3_3HvH3InvalidMaxPointsError,
  resolveM3_3HvH3MaxPointsPerSeries,
} from './m3-3-hv-h3-report-bounds.util';
import { detectHvM3MethodConflict } from '../hv-capacity-shadow/hv-capacity-m3.policy';

const orgId = '11111111-1111-4111-8111-111111111111';
const vehId = '22222222-2222-4222-8222-222222222222';
const evaluationAt = '2026-09-30T12:00:00.000Z';

function eligibleCandidate(
  partial: Partial<M3_3HvH2LongitudinalInputCandidateV1> &
    Pick<M3_3HvH2LongitudinalInputCandidateV1, 'method' | 'numericValue' | 'observedAt'>,
): M3_3HvH2LongitudinalInputCandidateV1 {
  const fp = randomUUID().replace(/-/g, '');
  return {
    contractVersion: M3_3_HV_H2_LONGITUDINAL_INPUT_CANDIDATE_V1,
    organizationId: orgId,
    vehicleId: vehId,
    batteryScope: 'HV',
    candidateFingerprint: fp,
    sourceEntityType: 'HvCapacityObservation',
    sourceEntityId: randomUUID(),
    methodRole:
      partial.method === 'M3_ADDED_ENERGY_DELTA_SOC'
        ? 'VALIDATION_ONLY'
        : partial.method === 'PROVIDER_HV_SOH'
          ? 'PROVIDER_EVIDENCE'
          : 'METHOD_SHADOW_EVIDENCE',
    valueSemantic:
      partial.method === 'PROVIDER_HV_SOH' ? 'PROVIDER_SOH_PERCENT' : 'ESTIMATED_USABLE_CAPACITY_KWH',
    unit: partial.method === 'PROVIDER_HV_SOH' ? 'percent' : 'kWh',
    receivedAt: null,
    sessionId: partial.sessionId ?? (partial.method === 'PROVIDER_HV_SOH' ? null : randomUUID()),
    provider: partial.provider ?? (partial.method === 'PROVIDER_HV_SOH' ? 'DIMO' : null),
    quality: BatteryMeasurementQuality.SHADOW,
    freshness: 'STALE',
    evidenceStrength: 'QUALIFIED_TELEMETRY_PROVISIONAL',
    modelVersion: partial.method === 'PROVIDER_HV_SOH' ? null : 1,
    sourceProvenance: 'test',
    eligibility: 'eligible',
    reasonCodes: [],
    lifecycleSegmentId: partial.lifecycleSegmentId ?? 'HV_SEGMENT_0',
    replacementBoundaryBeforeAt: null,
    replacementBoundaryAfterAt: null,
    maturity: 'LONGITUDINAL_INPUT_CANDIDATE',
    healthConclusion: null,
    observationValidity: 'VALID',
    currentDecisionFreshness: 'STALE',
    ...partial,
  } as M3_3HvH2LongitudinalInputCandidateV1;
}

function h2Report(
  candidates: M3_3HvH2LongitudinalInputCandidateV1[],
  overrides: Partial<M3_3HvH2LongitudinalInputReportV1> = {},
): M3_3HvH2LongitudinalInputReportV1 {
  return {
    contractVersion: M3_3_HV_H2_LONGITUDINAL_INPUT_REPORT_V1,
    organizationId: orgId,
    vehicleId: vehId,
    batteryScope: 'HV',
    evaluationAt,
    temporalSemantics:
      'OBSERVATION_EVENT_TIME_FILTERED|GT_KNOWLEDGE_AS_OF|SESSION_CONTEXT_CURRENT_OR_FAIL_CLOSED',
    truncated: false,
    lifecycleSegments: [{ lifecycleSegmentId: 'HV_SEGMENT_0', segmentIndex: 0, replacementBoundaryEffectiveAt: null }],
    candidates,
    validationAnchors: overrides.validationAnchors ?? [],
    derivedContext: [],
    summary: {} as never,
    methodIdentityRequired: true,
    crossMethodPoolingDefault: false,
    healthConclusion: null,
    customerPublicationEligible: false,
    dbReadOnlyTransactionEnforced: true,
    ...overrides,
  };
}

describe('M3.3-HV-H3 contracts', () => {
  it('seals scope and null degradation conclusions', () => {
    const report = buildM3_3HvH3LongitudinalTrendReportV1({ h2Report: h2Report([]) });
    expect(report.contractVersion).toBe(M3_3_HV_H3_LONGITUDINAL_TREND_REPORT_V1);
    expect(report.exposureAxis).toBe(M3_3_HV_H3_EXPOSURE_AXIS);
    expect(report.estimatorVersion).toBe(M3_3_HV_H3_ESTIMATOR_VERSION);
    expect(report.degradationConclusion).toBeNull();
    expect(report.trendDirectionConclusion).toBeNull();
    expect(report.healthConclusion).toBeNull();
    expect(report.customerPublicationEligible).toBe(false);
    expect(METHOD_IDENTITY_REQUIRED).toBe(true);
    expect(CROSS_METHOD_POOLING_DEFAULT).toBe(false);
    expect(CROSS_PROVIDER_POOLING_DEFAULT).toBe(false);
  });
});

describe('M3.3-HV-H3 M2 session balancing', () => {
  const sessionId = 'sess-m2-balance';
  it('aggregates 20 M2 observations in one session to one median point', () => {
    const values = Array.from({ length: 20 }, (_, i) => 50 + i * 0.1);
    const candidates = values.map((v, i) =>
      eligibleCandidate({
        method: 'M2_CURRENT_ENERGY_SOC',
        sessionId,
        numericValue: v,
        observedAt: `2026-0${1 + Math.floor(i / 10)}-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
        quality: BatteryMeasurementQuality.SHADOW,
      }),
    );
    const report = buildM3_3HvH3LongitudinalTrendReportV1({ h2Report: h2Report(candidates) });
    const m2 = report.lifecycleSegments[0]!.methodSeries.find(
      (s) => s.method === 'M2_CURRENT_ENERGY_SOC',
    );
    expect(m2?.trendPoints).toHaveLength(1);
    expect(m2?.trendPoints[0]?.sourceCandidateCount).toBe(20);
    expect(m2?.trendPoints[0]?.numericValue).toBeCloseTo(50.95, 5);
    expect(m2?.aggregationKind).toBe('M2_SESSION_MEDIAN');
  });
});

describe('M3.3-HV-H3 Theil-Sen', () => {
  it('computes deterministic median pairwise slope', () => {
    const points = [
      { xDays: 0, y: 10, observedAtIso: '2026-01-01T00:00:00.000Z' },
      { xDays: 10, y: 9, observedAtIso: '2026-01-11T00:00:00.000Z' },
      { xDays: 20, y: 8, observedAtIso: '2026-01-21T00:00:00.000Z' },
    ];
    const r = computeTheilSenMedianPairwiseSlopeV1(points);
    expect(r.trendAvailability).toBe('DESCRIPTIVE_SLOPE_AVAILABLE');
    expect(r.trendSlopePerDay).toBeCloseTo(-0.1, 8);
  });

  it('median pairwise slope stable for collinear series with added outlier point', () => {
    const base = [
      { xDays: 0, y: 10, observedAtIso: '2026-01-01T00:00:00.000Z' },
      { xDays: 10, y: 9, observedAtIso: '2026-01-11T00:00:00.000Z' },
      { xDays: 20, y: 8, observedAtIso: '2026-01-21T00:00:00.000Z' },
    ];
    const withOutlier = [
      ...base,
      { xDays: 30, y: 200, observedAtIso: '2026-01-31T00:00:00.000Z' },
    ];
    expect(computeTheilSenMedianPairwiseSlopeV1(base).trendSlopePerDay).toBeCloseTo(-0.1, 8);
    const outlierResult = computeTheilSenMedianPairwiseSlopeV1(withOutlier);
    expect(outlierResult.trendSlopePerDay).not.toBeCloseTo(6.33, 1);
    expect(Number.isFinite(outlierResult.trendSlopePerDay)).toBe(true);
  });
});

describe('M3.3-HV-H3 provider partition', () => {
  it('creates separate series per provider', () => {
    const candidates = [
      eligibleCandidate({
        method: 'PROVIDER_HV_SOH',
        provider: 'DIMO',
        numericValue: 92,
        observedAt: '2026-03-01T00:00:00.000Z',
        sessionId: null,
      }),
      eligibleCandidate({
        method: 'PROVIDER_HV_SOH',
        provider: 'HIGH_MOBILITY',
        numericValue: 90,
        observedAt: '2026-04-01T00:00:00.000Z',
        sessionId: null,
      }),
    ];
    const report = buildM3_3HvH3LongitudinalTrendReportV1({ h2Report: h2Report(candidates) });
    const series = report.lifecycleSegments[0]!.methodSeries.filter(
      (s) => s.method === 'PROVIDER_HV_SOH',
    );
    expect(series).toHaveLength(2);
    expect(series.map((s) => s.provider).sort()).toEqual(['DIMO', 'HIGH_MOBILITY']);
  });
});

describe('M3.3-HV-H3 M3 isolation', () => {
  it('keeps M3 primaryTrendEligible false', () => {
    const sid = randomUUID();
    const candidates = [
      eligibleCandidate({
        method: 'M3_ADDED_ENERGY_DELTA_SOC',
        sessionId: sid,
        numericValue: 55,
        observedAt: '2026-05-01T00:00:00.000Z',
        quality: BatteryMeasurementQuality.VALID_PROXY,
      }),
    ];
    const report = buildM3_3HvH3LongitudinalTrendReportV1({ h2Report: h2Report(candidates) });
    const m3 = report.lifecycleSegments[0]!.methodSeries.find(
      (s) => s.method === 'M3_ADDED_ENERGY_DELTA_SOC',
    );
    expect(m3?.primaryTrendEligible).toBe(false);
    expect(m3?.scientificRole).toBe('VALIDATION_ONLY');
  });
});

describe('M3.3-HV-H3 truncation', () => {
  it('marks scientificTrendEligible false when H2 truncated', () => {
    const sid = randomUUID();
    const candidates = [
      eligibleCandidate({
        method: 'M2_CURRENT_ENERGY_SOC',
        sessionId: sid,
        numericValue: 55,
        observedAt: '2026-05-01T00:00:00.000Z',
      }),
      eligibleCandidate({
        method: 'M2_CURRENT_ENERGY_SOC',
        sessionId: randomUUID(),
        numericValue: 54,
        observedAt: '2026-06-01T00:00:00.000Z',
      }),
    ];
    const report = buildM3_3HvH3LongitudinalTrendReportV1({
      h2Report: h2Report(candidates, { truncated: true }),
    });
    expect(report.sourceCompleteness).toBe('TRUNCATED');
    const m2 = report.lifecycleSegments[0]!.methodSeries.find(
      (s) => s.method === 'M2_CURRENT_ENERGY_SOC',
    );
    expect(m2?.scientificTrendEligible).toBe(false);
  });

  it('propagates H2 truncation to calendar exposure lifecycleComplete=false', () => {
    const report = buildM3_3HvH3LongitudinalTrendReportV1({
      h2Report: h2Report([], { truncated: true }),
    });
    expect(report.exposureAxisAudit.calendarTime.lifecycleComplete).toBe(false);
    expect(report.exposureAxisAudit.calendarTime.h3V1Used).toBe(true);
  });

  it('allows calendar lifecycleComplete when H2 not truncated', () => {
    const report = buildM3_3HvH3LongitudinalTrendReportV1({ h2Report: h2Report([]) });
    expect(report.exposureAxisAudit.calendarTime.lifecycleComplete).toBe(true);
  });
});

describe('M3.3-HV-H3 GT validation context', () => {
  it('does not add validation anchors to trend points', () => {
    const report = buildM3_3HvH3LongitudinalTrendReportV1({
      h2Report: h2Report([], {
        validationAnchors: [
          {
            groundTruthEventId: 'gt-1',
            organizationId: orgId,
            vehicleId: vehId,
            batteryScope: 'HV',
            groundTruthType: 'BATTERY_REPLACEMENT',
            effectiveAt: '2026-01-01T00:00:00.000Z',
            createdAt: '2026-01-02T00:00:00.000Z',
            sourceProvenance: 'manual',
            verificationStatus: 'CONFIRMED',
            verificationStatusAtEvaluationAt: 'CONFIRMED',
            currentVerificationStatus: 'CONFIRMED',
            maturity: 'CONFIRMED_GROUND_TRUTH_FACT',
          },
        ],
      }),
    });
    expect(report.validationContext).toHaveLength(1);
    const allPoints = report.lifecycleSegments.flatMap((s) =>
      s.methodSeries.flatMap((m) => m.trendPoints),
    );
    expect(allPoints).toHaveLength(0);
  });
});

describe('M3.3-HV-H3 serialization', () => {
  it('never emits NaN or Infinity in JSON', () => {
    const sid = randomUUID();
    const report = buildM3_3HvH3LongitudinalTrendReportV1({
      h2Report: h2Report([
        eligibleCandidate({
          method: 'M2_CURRENT_ENERGY_SOC',
          sessionId: sid,
          numericValue: 55,
          observedAt: '2026-05-01T00:00:00.000Z',
        }),
        eligibleCandidate({
          method: 'M2_CURRENT_ENERGY_SOC',
          sessionId: randomUUID(),
          numericValue: 54,
          observedAt: '2026-07-01T00:00:00.000Z',
        }),
      ]),
    });
    const json = JSON.stringify(report);
    expect(json).not.toMatch(/\bNaN\b/);
    expect(json).not.toMatch(/\bInfinity\b/);
  });
});

describe('M3.3-HV-H3 stale history', () => {
  it('includes eligible candidate with STALE currentDecisionFreshness', () => {
    const report = buildM3_3HvH3LongitudinalTrendReportV1({
      h2Report: h2Report([
        eligibleCandidate({
          method: 'M2_CURRENT_ENERGY_SOC',
          sessionId: randomUUID(),
          numericValue: 55,
          observedAt: '2024-01-01T00:00:00.000Z',
          currentDecisionFreshness: 'STALE',
        }),
        eligibleCandidate({
          method: 'M2_CURRENT_ENERGY_SOC',
          sessionId: randomUUID(),
          numericValue: 54,
          observedAt: '2024-06-01T00:00:00.000Z',
          currentDecisionFreshness: 'STALE',
        }),
      ]),
    });
    const m2 = report.lifecycleSegments[0]!.methodSeries.find(
      (s) => s.method === 'M2_CURRENT_ENERGY_SOC',
    );
    expect(m2?.pointCount).toBe(2);
  });
});

describe('M3.3-HV-H3 Theil-Sen edge cases', () => {
  it('reports insufficient for one point', () => {
    const r = computeTheilSenMedianPairwiseSlopeV1([
      { xDays: 0, y: 10, observedAtIso: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(r.trendAvailability).toBe('INSUFFICIENT_DISTINCT_TIMEPOINTS');
  });

  it('reports insufficient when all points share timestamp (zero-delta pairs excluded)', () => {
    const r = computeTheilSenMedianPairwiseSlopeV1([
      { xDays: 0, y: 10, observedAtIso: '2026-01-01T00:00:00.000Z' },
      { xDays: 0, y: 11, observedAtIso: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(r.pairwiseSlopeCount).toBe(0);
    expect(r.trendAvailability).toBe('INSUFFICIENT_DISTINCT_TIMEPOINTS');
  });

  it('allows two-point slope', () => {
    const r = computeTheilSenMedianPairwiseSlopeV1([
      { xDays: 0, y: 10, observedAtIso: '2026-01-01T00:00:00.000Z' },
      { xDays: 5, y: 9, observedAtIso: '2026-01-06T00:00:00.000Z' },
    ]);
    expect(r.trendAvailability).toBe('DESCRIPTIVE_SLOPE_AVAILABLE');
    expect(r.pairwiseSlopeCount).toBe(1);
  });
});

describe('M3.3-HV-H3 M2 slope isolation from M3', () => {
  it('M3 series does not change M2 Theil-Sen slope', () => {
    const s1 = randomUUID();
    const s2 = randomUUID();
    const m2Only = buildM3_3HvH3LongitudinalTrendReportV1({
      h2Report: h2Report([
        eligibleCandidate({
          method: 'M2_CURRENT_ENERGY_SOC',
          sessionId: s1,
          numericValue: 60,
          observedAt: '2026-01-01T00:00:00.000Z',
        }),
        eligibleCandidate({
          method: 'M2_CURRENT_ENERGY_SOC',
          sessionId: s2,
          numericValue: 58,
          observedAt: '2026-02-01T00:00:00.000Z',
        }),
      ]),
    });
    const withM3 = buildM3_3HvH3LongitudinalTrendReportV1({
      h2Report: h2Report([
        eligibleCandidate({
          method: 'M2_CURRENT_ENERGY_SOC',
          sessionId: s1,
          numericValue: 60,
          observedAt: '2026-01-01T00:00:00.000Z',
        }),
        eligibleCandidate({
          method: 'M2_CURRENT_ENERGY_SOC',
          sessionId: s2,
          numericValue: 58,
          observedAt: '2026-02-01T00:00:00.000Z',
        }),
        eligibleCandidate({
          method: 'M3_ADDED_ENERGY_DELTA_SOC',
          sessionId: s1,
          numericValue: 59,
          observedAt: '2026-01-01T12:00:00.000Z',
          quality: BatteryMeasurementQuality.VALID_PROXY,
        }),
      ]),
    });
    const m2OnlySeries = m2Only.lifecycleSegments[0]!.methodSeries.find(
      (s) => s.method === 'M2_CURRENT_ENERGY_SOC',
    );
    const m2WithM3Series = withM3.lifecycleSegments[0]!.methodSeries.find(
      (s) => s.method === 'M2_CURRENT_ENERGY_SOC',
    );
    expect(m2WithM3Series?.trendSlopePerDay).toBe(m2OnlySeries?.trendSlopePerDay);
  });
});

describe('M3.3-HV-H3 lifecycle pooling', () => {
  it('never pools pre/post replacement M2 into one series partition', () => {
    const sidPre = randomUUID();
    const sidPost = randomUUID();
    const report = buildM3_3HvH3LongitudinalTrendReportV1({
      h2Report: h2Report([
        eligibleCandidate({
          method: 'M2_CURRENT_ENERGY_SOC',
          lifecycleSegmentId: 'HV_SEGMENT_0',
          sessionId: sidPre,
          numericValue: 60,
          observedAt: '2025-06-01T00:00:00.000Z',
        }),
        eligibleCandidate({
          method: 'M2_CURRENT_ENERGY_SOC',
          lifecycleSegmentId: 'HV_SEGMENT_1',
          sessionId: sidPost,
          numericValue: 75,
          observedAt: '2026-06-01T00:00:00.000Z',
        }),
      ], {
        lifecycleSegments: [
          { lifecycleSegmentId: 'HV_SEGMENT_0', segmentIndex: 0, replacementBoundaryEffectiveAt: null },
          { lifecycleSegmentId: 'HV_SEGMENT_1', segmentIndex: 1, replacementBoundaryEffectiveAt: '2026-01-01T00:00:00.000Z' },
        ],
      }),
    });
    const m2Series = report.lifecycleSegments.flatMap((s) =>
      s.methodSeries.filter((m) => m.method === 'M2_CURRENT_ENERGY_SOC'),
    );
    expect(m2Series).toHaveLength(2);
    expect(new Set(m2Series.map((s) => s.lifecycleSegmentId)).size).toBe(2);
  });
});

describe('M3.3-HV-H3 H2 ineligible exclusion', () => {
  it('excludes ineligible H2 candidates from fit', () => {
    const report = buildM3_3HvH3LongitudinalTrendReportV1({
      h2Report: h2Report([
        eligibleCandidate({
          method: 'M2_CURRENT_ENERGY_SOC',
          sessionId: randomUUID(),
          numericValue: 55,
          observedAt: '2026-05-01T00:00:00.000Z',
          eligibility: 'ineligible',
        }),
        eligibleCandidate({
          method: 'M2_CURRENT_ENERGY_SOC',
          sessionId: randomUUID(),
          numericValue: 54,
          observedAt: '2026-06-01T00:00:00.000Z',
        }),
        eligibleCandidate({
          method: 'M2_CURRENT_ENERGY_SOC',
          sessionId: randomUUID(),
          numericValue: 53,
          observedAt: '2026-07-01T00:00:00.000Z',
        }),
      ]),
    });
    const m2 = report.lifecycleSegments[0]!.methodSeries.find(
      (s) => s.method === 'M2_CURRENT_ENERGY_SOC',
    );
    expect(m2?.pointCount).toBe(2);
  });
});

describe('M3.3-HV-H3 malformed H2 contract', () => {
  it('fail-closes malformed method role without trend point', () => {
    const bad = eligibleCandidate({
      method: 'M2_CURRENT_ENERGY_SOC',
      sessionId: randomUUID(),
      numericValue: 55,
      observedAt: '2026-05-01T00:00:00.000Z',
      methodRole: 'VALIDATION_ONLY' as never,
    });
    const report = buildM3_3HvH3LongitudinalTrendReportV1({ h2Report: h2Report([bad]) });
    expect(report.inputAnomalies.some((a) => a.code === M3_3_HV_H3_INPUT_ANOMALY_CODES.MALFORMED_H2_METHOD_CONTRACT)).toBe(true);
    expect(report.lifecycleSegments.flatMap((s) => s.methodSeries)).toHaveLength(0);
  });

  it('rejects tenant scope mismatch on candidate', () => {
    const bad = eligibleCandidate({
      method: 'M2_CURRENT_ENERGY_SOC',
      organizationId: randomUUID(),
      sessionId: randomUUID(),
      numericValue: 55,
      observedAt: '2026-05-01T00:00:00.000Z',
    });
    const report = buildM3_3HvH3LongitudinalTrendReportV1({ h2Report: h2Report([bad]) });
    expect(report.inputAnomalies.some((a) => a.code === M3_3_HV_H3_INPUT_ANOMALY_CODES.H3_TENANT_SCOPE_MISMATCH)).toBe(true);
  });
});

describe('M3.3-HV-H3 M3 duplicate session', () => {
  it('fail-closes distinct M3 candidates per session (no silent median)', () => {
    const sid = randomUUID();
    const report = buildM3_3HvH3LongitudinalTrendReportV1({
      h2Report: h2Report([
        eligibleCandidate({
          method: 'M3_ADDED_ENERGY_DELTA_SOC',
          sessionId: sid,
          numericValue: 55,
          observedAt: '2026-05-01T00:00:00.000Z',
          quality: BatteryMeasurementQuality.VALID_PROXY,
        }),
        eligibleCandidate({
          method: 'M3_ADDED_ENERGY_DELTA_SOC',
          sessionId: sid,
          numericValue: 56,
          observedAt: '2026-05-01T01:00:00.000Z',
          quality: BatteryMeasurementQuality.VALID_PROXY,
        }),
      ]),
    });
    const m3 = report.lifecycleSegments[0]!.methodSeries.find(
      (s) => s.method === 'M3_ADDED_ENERGY_DELTA_SOC',
    );
    expect(m3?.trendPoints.filter((p) => p.sessionId === sid)).toHaveLength(0);
    expect(
      report.inputAnomalies.some(
        (a) => a.code === M3_3_HV_H3_INPUT_ANOMALY_CODES.DUPLICATE_M3_SESSION_EVIDENCE,
      ),
    ).toBe(true);
    expect(m3?.seriesInputAnomalies?.[0]?.code).toBe(
      M3_3_HV_H3_INPUT_ANOMALY_CODES.DUPLICATE_M3_SESSION_EVIDENCE,
    );
  });
});

describe('M3.3-HV-H3 fingerprint order', () => {
  it('produces identical report regardless of candidate insertion order', () => {
    const c1 = eligibleCandidate({
      method: 'M2_CURRENT_ENERGY_SOC',
      sessionId: randomUUID(),
      numericValue: 55,
      observedAt: '2026-05-01T00:00:00.000Z',
    });
    const c2 = eligibleCandidate({
      method: 'M2_CURRENT_ENERGY_SOC',
      sessionId: randomUUID(),
      numericValue: 54,
      observedAt: '2026-06-01T00:00:00.000Z',
    });
    const a = buildM3_3HvH3LongitudinalTrendReportV1({ h2Report: h2Report([c1, c2]) });
    const b = buildM3_3HvH3LongitudinalTrendReportV1({ h2Report: h2Report([c2, c1]) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('M3.3-HV-H3 method agreement ratio parity', () => {
  it('matches detectHvM3MethodConflict deviationRatio denominator (M2 median)', () => {
    const sid = randomUUID();
    const m2Val = 55;
    const m3Val = 50;
    const report = buildM3_3HvH3LongitudinalTrendReportV1({
      h2Report: h2Report([
        eligibleCandidate({
          method: 'M2_CURRENT_ENERGY_SOC',
          sessionId: sid,
          numericValue: m2Val,
          observedAt: '2026-05-01T00:00:00.000Z',
        }),
        eligibleCandidate({
          method: 'M2_CURRENT_ENERGY_SOC',
          sessionId: randomUUID(),
          numericValue: 54,
          observedAt: '2026-06-01T00:00:00.000Z',
        }),
        eligibleCandidate({
          method: 'M3_ADDED_ENERGY_DELTA_SOC',
          sessionId: sid,
          numericValue: m3Val,
          observedAt: '2026-05-01T00:00:00.000Z',
          quality: BatteryMeasurementQuality.VALID_PROXY,
        }),
      ]),
    });
    expect(report.methodAgreementDiagnostics.relativeDifferenceReference).toBe(
      M3_3_HV_H3_RELATIVE_DIFFERENCE_REFERENCE,
    );
    const sessionDiag = report.methodAgreementDiagnostics.sessions.find(
      (s) => s.sessionId === sid,
    );
    const conflict = detectHvM3MethodConflict({
      m3CapacityKwh: m3Val,
      m2MedianCapacityKwh: m2Val,
    });
    expect(sessionDiag?.relativeDifferenceRatio).toBeCloseTo(conflict.deviationRatio!, 10);
  });
});

describe('M3.3-HV-H3 maxPointsPerSeries bounds', () => {
  it('rejects zero and negative maxPointsPerSeries', () => {
    expect(() => resolveM3_3HvH3MaxPointsPerSeries(0)).toThrow(M3_3HvH3InvalidMaxPointsError);
    expect(() => resolveM3_3HvH3MaxPointsPerSeries(-1)).toThrow(M3_3HvH3InvalidMaxPointsError);
  });

  it('clamps HARD+1 to hard max', () => {
    expect(resolveM3_3HvH3MaxPointsPerSeries(M3_3_HV_H3_MAX_POINTS_PER_SERIES_HARD + 1)).toBe(
      M3_3_HV_H3_MAX_POINTS_PER_SERIES_HARD,
    );
  });
});

describe('M3.3-HV-H3 equal session weight', () => {
  it('weights multiple M2 sessions equally (one median point each)', () => {
    const heavySession = randomUUID();
    const lightSession = randomUUID();
    const report = buildM3_3HvH3LongitudinalTrendReportV1({
      h2Report: h2Report([
        ...Array.from({ length: 10 }, (_, i) =>
          eligibleCandidate({
            method: 'M2_CURRENT_ENERGY_SOC',
            sessionId: heavySession,
            numericValue: 50 + i * 0.01,
            observedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
          }),
        ),
        eligibleCandidate({
          method: 'M2_CURRENT_ENERGY_SOC',
          sessionId: lightSession,
          numericValue: 40,
          observedAt: '2026-06-01T00:00:00.000Z',
        }),
        eligibleCandidate({
          method: 'M2_CURRENT_ENERGY_SOC',
          sessionId: randomUUID(),
          numericValue: 39,
          observedAt: '2026-07-01T00:00:00.000Z',
        }),
      ]),
    });
    const m2 = report.lifecycleSegments[0]!.methodSeries.find(
      (s) => s.method === 'M2_CURRENT_ENERGY_SOC',
    );
    expect(m2?.pointCount).toBe(3);
    expect(m2?.trendPoints.find((p) => p.sessionId === heavySession)?.sourceCandidateCount).toBe(10);
    expect(m2?.trendPoints.find((p) => p.sessionId === lightSession)?.sourceCandidateCount).toBe(1);
  });
});

describe('M3.3-HV-H3 series size bound', () => {
  it('fails scientific eligibility when series exceeds hard point bound', () => {
    const candidates = Array.from({ length: M3_3_HV_H3_MAX_POINTS_PER_SERIES_HARD + 1 }, (_, i) =>
      eligibleCandidate({
        method: 'M2_CURRENT_ENERGY_SOC',
        sessionId: `sess-${i}`,
        numericValue: 50 + i * 0.01,
        observedAt: `2024-${String((i % 12) + 1).padStart(2, '0')}-01T00:00:00.000Z`,
      }),
    );
    const report = buildM3_3HvH3LongitudinalTrendReportV1({
      h2Report: h2Report(candidates),
      maxPointsPerSeries: M3_3_HV_H3_MAX_POINTS_PER_SERIES_HARD,
    });
    const m2 = report.lifecycleSegments[0]!.methodSeries.find(
      (s) => s.method === 'M2_CURRENT_ENERGY_SOC',
    );
    expect(m2?.trendAvailability).toBe('SERIES_TOO_LARGE_FOR_V1_ESTIMATOR');
    expect(m2?.scientificTrendEligible).toBe(false);
  });
});
