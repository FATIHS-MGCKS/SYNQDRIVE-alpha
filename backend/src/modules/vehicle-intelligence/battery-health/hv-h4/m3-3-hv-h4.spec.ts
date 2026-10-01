import { BatteryEvidenceScope, BatteryGroundTruthType } from '@prisma/client';
import {
  assertM3_3HvH4EnergySemanticFirewall,
  classifyM3_3HvH4ChargeSessionFutureThroughput,
} from './m3-3-hv-h4-charge-session-source-authority';
import {
  buildM3_3HvH4CoverageReportV1,
  validateM3_3HvH4CoverageReportContract,
} from './m3-3-hv-h4-coverage-report.builder';
import {
  CLICKHOUSE_CANONICAL_H4_EXPOSURE_AUTHORITY,
  EXISTING_RETENTION_AGGREGATES_PRESERVE_CHARGE_THROUGHPUT,
  H4_AUTOMATIC_RUNTIME_REACHABLE,
  M3_3_HV_H4_DEFAULT_RETENTION_DAYS,
  NATIVE_FALLBACK_CHARGING_ADDED_SEMANTIC_EQUIVALENCE_PROVEN,
} from './m3-3-hv-h4.constants';
import { buildM3_3HvH4ExposureSourceAuthorityContractV1 } from './m3-3-hv-h4-exposure-source-authority.v1';
import { resolveM3_3HvH4ReplacementBoundaries } from './m3-3-hv-h4-lifecycle.util';
import type { M3_3HvH4LoadedDataV1 } from './m3-3-hv-h4-loaded-data.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import {
  HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
  HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
} from '../hv-charge-session/hv-charge-session.types';

function emptyRange() {
  return { count: 0, earliest: null, latest: null };
}

function baseLoaded(overrides: Partial<M3_3HvH4LoadedDataV1>): M3_3HvH4LoadedDataV1 {
  const evaluationAt = overrides.evaluationAt ?? new Date('2026-08-01T12:00:00.000Z');
  return {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    evaluationAt,
    groundTruthEvents: [],
    chargeSessions: [],
    hvSnapshots: emptyRange(),
    hvSocEvidence: emptyRange(),
    hvTemperatureEvidence: emptyRange(),
    hvChargingPowerEvidence: emptyRange(),
    retentionCutoffs: {
      hvChargeSessionEarliestRemaining: new Date(
        evaluationAt.getTime() - M3_3_HV_H4_DEFAULT_RETENTION_DAYS.hvChargeSessions * 86400000,
      ),
      hvSnapshotEarliestRemaining: new Date(
        evaluationAt.getTime() - M3_3_HV_H4_DEFAULT_RETENTION_DAYS.hvProviderSnapshots * 86400000,
      ),
    },
    ...overrides,
  };
}

describe('M3.3-HV-H4 exposure source authority contract', () => {
  it('preserves A0 axis coverage classes without upgrade', () => {
    const contract = buildM3_3HvH4ExposureSourceAuthorityContractV1();
    const byAxis = Object.fromEntries(contract.axes.map((a) => [a.axis, a]));
    expect(byAxis.CALENDAR_TIME?.coverageClass).toBe('BOUNDED_GAP_AWARE');
    expect(byAxis.ODOMETER_KM?.coverageClass).toBe('POINT_CONTEXT_ONLY');
    expect(byAxis.CHARGE_THROUGHPUT_KWH?.coverageClass).toBe('BOUNDED_GAP_AWARE');
    expect(byAxis.FULL_EQUIVALENT_CYCLES?.coverageClass).toBe('UNAVAILABLE');
    expect(byAxis.TEMPERATURE_EXPOSURE?.coverageClass).toBe('POINT_CONTEXT_ONLY');
    expect(byAxis.SOC_WINDOW_EXPOSURE?.coverageClass).toBe('POINT_CONTEXT_ONLY');
    expect(byAxis.FAST_CHARGE_EXPOSURE?.coverageClass).toBe('POINT_CONTEXT_ONLY');
    expect(byAxis.CALENDAR_TIME?.semanticAuthority).toBe('OBSERVATION_CALENDAR_TIME');
    expect(byAxis.FULL_EQUIVALENT_CYCLES?.integrationAllowed).toBe(false);
  });

  it('documents retention aggregate gap for charge throughput', () => {
    expect(EXISTING_RETENTION_AGGREGATES_PRESERVE_CHARGE_THROUGHPUT).toBe(false);
  });

  it('keeps ClickHouse non-canonical', () => {
    expect(CLICKHOUSE_CANONICAL_H4_EXPOSURE_AUTHORITY).toBe(false);
  });
});

describe('M3.3-HV-H4 charge session future throughput classification', () => {
  const boundaries = [{ effectiveAt: new Date('2026-06-01T00:00:00.000Z'), groundTruthEventId: 'gt-1' }];

  it('excludes ongoing sessions', () => {
    const result = classifyM3_3HvH4ChargeSessionFutureThroughput({
      session: {
        id: 's1',
        source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
        startAt: new Date('2026-07-01T00:00:00.000Z'),
        endAt: null,
        isOngoing: true,
        energyAddedKwh: 10,
        metadata: { qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED },
      },
      replacementBoundaries: boundaries,
    });
    expect(result.eligibility).toBe('INELIGIBLE_ONGOING');
  });

  it('excludes superseded fallback rows', () => {
    const result = classifyM3_3HvH4ChargeSessionFutureThroughput({
      session: {
        id: 's2',
        source: HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
        startAt: new Date('2026-07-01T00:00:00.000Z'),
        endAt: new Date('2026-07-01T02:00:00.000Z'),
        isOngoing: false,
        energyAddedKwh: 8,
        metadata: {
          qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
          supersededBySegmentFingerprint: 'native-fp',
        },
      },
      replacementBoundaries: boundaries,
    });
    expect(result.eligibility).toBe('INELIGIBLE_SUPERSEDED');
  });

  it('fail-closes replacement intersection', () => {
    const result = classifyM3_3HvH4ChargeSessionFutureThroughput({
      session: {
        id: 's3',
        source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
        startAt: new Date('2026-05-31T22:00:00.000Z'),
        endAt: new Date('2026-06-01T02:00:00.000Z'),
        isOngoing: false,
        energyAddedKwh: 12,
        metadata: { qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED },
      },
      replacementBoundaries: boundaries,
    });
    expect(result.eligibility).toBe('INELIGIBLE_REPLACEMENT_INTERSECTION');
  });

  it('does not treat fallback as eligible when semantic equivalence is not proven', () => {
    expect(NATIVE_FALLBACK_CHARGING_ADDED_SEMANTIC_EQUIVALENCE_PROVEN).toBe(false);
    const result = classifyM3_3HvH4ChargeSessionFutureThroughput({
      session: {
        id: 's4',
        source: HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
        startAt: new Date('2026-07-10T00:00:00.000Z'),
        endAt: new Date('2026-07-10T03:00:00.000Z'),
        isOngoing: false,
        energyAddedKwh: 5,
        metadata: { qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED },
      },
      replacementBoundaries: [],
    });
    expect(result.eligibility).toBe('CONTEXT_ONLY');
  });
});

describe('M3.3-HV-H4 coverage report builder', () => {
  it('is deterministic for the same evaluationAt input', () => {
    const evaluationAt = new Date('2026-08-15T00:00:00.000Z');
    const loaded = baseLoaded({
      evaluationAt,
      chargeSessions: [
        {
          id: 'sess-1',
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          measurementSessionId: null,
          segmentFingerprint: 'fp-1',
          dimoSegmentId: 'd1',
          source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
          startAt: new Date('2026-07-01T00:00:00.000Z'),
          endAt: new Date('2026-07-01T02:00:00.000Z'),
          startSocPercent: 20,
          endSocPercent: 80,
          startEnergyKwh: 10,
          endEnergyKwh: 40,
          energyAddedKwh: 15,
          deltaSocPercent: 60,
          isOngoing: false,
          quality: null,
          idempotencyKey: 'k1',
          providerObservedAt: new Date('2026-07-01T02:00:00.000Z'),
          receivedAt: new Date('2026-07-01T02:00:00.000Z'),
          metadata: { qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED },
          createdAt: new Date('2026-07-01T02:00:00.000Z'),
          updatedAt: new Date('2026-07-01T02:00:00.000Z'),
        },
      ],
    });
    const a = buildM3_3HvH4CoverageReportV1(loaded);
    const b = buildM3_3HvH4CoverageReportV1(loaded);
    expect(a).toEqual(b);
    expect(a.cumulativeExposureValues).toBe(false);
    expect(a.automaticRuntimeReachable).toBe(H4_AUTOMATIC_RUNTIME_REACHABLE);
  });

  it('segments replacement boundaries without pre/post pooling in classifications', () => {
    const evaluationAt = new Date('2026-09-01T00:00:00.000Z');
    const gtCreated = new Date('2026-01-01T00:00:00.000Z');
    const loaded = baseLoaded({
      evaluationAt,
      groundTruthEvents: [
        {
          id: 'gt-hv',
          batteryScope: BatteryEvidenceScope.HV,
          groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
          effectiveAt: new Date('2026-06-01T00:00:00.000Z'),
          createdAt: gtCreated,
          verificationStatus: 'CONFIRMED',
          revocations: [],
          supersededByGroundTruthEvents: [],
        },
      ],
      chargeSessions: [
        {
          id: 'pre',
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          measurementSessionId: null,
          segmentFingerprint: 'fp-pre',
          dimoSegmentId: null,
          source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
          startAt: new Date('2026-05-01T00:00:00.000Z'),
          endAt: new Date('2026-05-01T02:00:00.000Z'),
          startSocPercent: 10,
          endSocPercent: 50,
          startEnergyKwh: null,
          endEnergyKwh: null,
          energyAddedKwh: 9,
          deltaSocPercent: 40,
          isOngoing: false,
          quality: null,
          idempotencyKey: 'k-pre',
          providerObservedAt: new Date('2026-05-01T02:00:00.000Z'),
          receivedAt: new Date('2026-05-01T02:00:00.000Z'),
          metadata: { qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED },
          createdAt: gtCreated,
          updatedAt: gtCreated,
        },
        {
          id: 'post',
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          measurementSessionId: null,
          segmentFingerprint: 'fp-post',
          dimoSegmentId: null,
          source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
          startAt: new Date('2026-07-01T00:00:00.000Z'),
          endAt: new Date('2026-07-01T02:00:00.000Z'),
          startSocPercent: 10,
          endSocPercent: 50,
          startEnergyKwh: null,
          endEnergyKwh: null,
          energyAddedKwh: 11,
          deltaSocPercent: 40,
          isOngoing: false,
          quality: null,
          idempotencyKey: 'k-post',
          providerObservedAt: new Date('2026-07-01T02:00:00.000Z'),
          receivedAt: new Date('2026-07-01T02:00:00.000Z'),
          metadata: { qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED },
          createdAt: gtCreated,
          updatedAt: gtCreated,
        },
      ],
    });
    const report = buildM3_3HvH4CoverageReportV1(loaded);
    expect(report.lifecycleSegments.map((s) => s.lifecycleSegmentId)).toEqual([
      'HV_SEGMENT_0',
      'HV_SEGMENT_1',
    ]);
    const pre = report.chargeSessionClassifications.find((c) => c.sessionId === 'pre');
    const post = report.chargeSessionClassifications.find((c) => c.sessionId === 'post');
    expect(pre?.lifecycleSegmentId).toBe('HV_SEGMENT_0');
    expect(post?.lifecycleSegmentId).toBe('HV_SEGMENT_1');
    validateM3_3HvH4CoverageReportContract(report);
  });

  it('marks temperature and SOC as point context without integration authority', () => {
    const evaluationAt = new Date('2026-08-01T00:00:00.000Z');
    const loaded = baseLoaded({
      evaluationAt,
      hvSnapshots: {
        count: 2,
        earliest: new Date('2026-07-01T00:00:00.000Z'),
        latest: new Date('2026-07-02T00:00:00.000Z'),
      },
    });
    const report = buildM3_3HvH4CoverageReportV1(loaded);
    const temp = report.axes.find(
      (a) => a.axis === 'TEMPERATURE_EXPOSURE' && a.lifecycleSegmentId === 'HV_SEGMENT_0',
    );
    const soc = report.axes.find(
      (a) => a.axis === 'SOC_WINDOW_EXPOSURE' && a.lifecycleSegmentId === 'HV_SEGMENT_0',
    );
    expect(temp?.coverageClass).toBe('POINT_CONTEXT_ONLY');
    expect(temp?.integrationAllowed).toBe(false);
    expect(soc?.coverageClass).toBe('POINT_CONTEXT_ONLY');
  });

  it('does not label first observation as physical battery age', () => {
    const report = buildM3_3HvH4CoverageReportV1(
      baseLoaded({
        hvSnapshots: {
          count: 1,
          earliest: new Date('2026-07-01T00:00:00.000Z'),
          latest: new Date('2026-07-01T00:00:00.000Z'),
        },
      }),
    );
    const cal = report.axisAuthorities.find((a) => a.axis === 'CALENDAR_TIME');
    expect(cal?.semanticAuthority).toBe('OBSERVATION_CALENDAR_TIME');
    expect(report.axes[0]?.evidenceStart.boundaryKind).not.toBe('LIFECYCLE_REPLACEMENT_BOUNDARY');
  });

  it('passes energy semantic firewall', () => {
    expect(assertM3_3HvH4EnergySemanticFirewall().pass).toBe(true);
    expect(assertM3_3HvH4EnergySemanticFirewall().prohibitedChargeThroughputSources).toContain(
      'VehicleEnergyEvent.energyDeltaKwh',
    );
  });

  it('supports late replacement GT knowable at evaluationAt', () => {
    const evaluationAt = new Date('2026-08-01T00:00:00.000Z');
    const events = [
      {
        id: 'gt-late',
        batteryScope: BatteryEvidenceScope.HV,
        groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
        effectiveAt: new Date('2026-06-01T00:00:00.000Z'),
        createdAt: new Date('2026-07-15T00:00:00.000Z'),
        verificationStatus: 'CONFIRMED' as const,
        revocations: [],
        supersededByGroundTruthEvents: [],
      },
    ];
    expect(resolveM3_3HvH4ReplacementBoundaries(events, evaluationAt)).toHaveLength(1);
  });

  it('fails closed on malformed report contract', () => {
    const report = buildM3_3HvH4CoverageReportV1(baseLoaded({}));
    const bad = { ...report, cumulativeExposureValues: true as unknown as false };
    expect(() => validateM3_3HvH4CoverageReportContract(bad)).toThrow(/cumulativeExposureValues/);
  });
});

describe('M3.3-HV-H4 tenant isolation', () => {
  it('requires organizationId on loaded data envelope', () => {
    const report = buildM3_3HvH4CoverageReportV1(
      baseLoaded({ organizationId: 'org-a', vehicleId: 'veh-a' }),
    );
    expect(report.organizationId).toBe('org-a');
    expect(report.vehicleId).toBe('veh-a');
  });
});
